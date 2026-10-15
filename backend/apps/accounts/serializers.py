from django.contrib.auth.hashers import make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.core import validators as v
from apps.core.models import Campement, Personne

from .models import Journal, RoleUtilisateur, Utilisateur


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)


class ChangementMotDePasseSerializer(serializers.Serializer):
    ancien_mot_de_passe = serializers.CharField(write_only=True)
    nouveau_mot_de_passe = serializers.CharField(write_only=True)
    confirmation = serializers.CharField(write_only=True)

    def validate_ancien_mot_de_passe(self, value):
        from django.contrib.auth.hashers import check_password
        if not check_password(value, self.context['request'].user.password_hash):
            raise serializers.ValidationError('Mot de passe actuel incorrect.')
        return value

    def validate(self, attrs):
        nouveau = attrs['nouveau_mot_de_passe']
        if nouveau != attrs['confirmation']:
            raise serializers.ValidationError({'confirmation': 'La confirmation ne correspond pas au nouveau mot de passe.'})
        if nouveau == attrs['ancien_mot_de_passe']:
            raise serializers.ValidationError({'nouveau_mot_de_passe': "Le nouveau mot de passe doit être différent de l'actuel."})
        try:
            validate_password(nouveau)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'nouveau_mot_de_passe': list(exc.messages)})
        return attrs

    def save(self):
        user = self.context['request'].user
        user.password_hash = make_password(self.validated_data['nouveau_mot_de_passe'])
        user.save(update_fields=['password_hash'])
        return user


class MotDePasseOublieSerializer(serializers.Serializer):
    email = serializers.CharField(max_length=150)


class ReinitialiserMotDePasseSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=200)
    nouveau_mot_de_passe = serializers.CharField(write_only=True, max_length=128)
    confirmation = serializers.CharField(write_only=True, max_length=128)

    def validate(self, attrs):
        if attrs['nouveau_mot_de_passe'] != attrs['confirmation']:
            raise serializers.ValidationError({'confirmation': 'La confirmation ne correspond pas au nouveau mot de passe.'})
        return attrs


class MeSerializer(serializers.ModelSerializer):
    """Profil de l'utilisateur connecté, au format attendu par le frontend."""

    email = serializers.CharField(source='username')
    name = serializers.CharField(source='personne.nom_complet')
    role = serializers.CharField(source='role.code')
    role_libelle = serializers.CharField(source='role.libelle')
    personne_id = serializers.IntegerField()

    class Meta:
        model = Utilisateur
        fields = ['id', 'username', 'email', 'name', 'role', 'role_libelle', 'personne_id', 'derniere_connexion']


class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = RoleUtilisateur
        fields = ['id', 'code', 'libelle']


class UtilisateurSerializer(serializers.ModelSerializer):
    """
    Compte d'accès. À la création, le Big Boss rattache le compte à une personne existante (`personne_id`) ou en crée
    une du même coup (`prenom`, `nom_personne`, `telephone` facultatif) : c'est ainsi qu'il crée un superviseur. Un superviseur est
    responsable de campements : `campements_ids` (facultatif) lui confie ces campements, qu'il gère avec tous leurs blocs.
    """

    personne_id = v.RelatedField(source='personne', queryset=Personne.objects.all(), required=False)
    prenom = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=100)
    nom_personne = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=100)
    telephone = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=30)
    campements_ids = serializers.ListField(child=serializers.IntegerField(), write_only=True, required=False, allow_empty=True)
    nom = serializers.CharField(source='personne.nom_complet', read_only=True)
    campements = serializers.SerializerMethodField()
    email = serializers.EmailField(source='username')
    role = serializers.SlugRelatedField(slug_field='code', queryset=RoleUtilisateur.objects.all(),
                                        error_messages={'does_not_exist': 'Rôle inconnu.'})
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, style={'input_type': 'password'})

    class Meta:
        model = Utilisateur
        fields = ['id', 'personne_id', 'nom', 'email', 'role', 'actif', 'derniere_connexion', 'password', 'campements',
                  'prenom', 'nom_personne', 'telephone', 'campements_ids']
        read_only_fields = ['derniere_connexion']

    def get_campements(self, obj):
        """Campements dont ce compte est responsable (ceux qu'il gère, avec tous leurs blocs)."""
        return [{'id': c.pk, 'nom': c.nom} for c in obj.personne.campements_responsable.order_by('nom')]

    def validate_email(self, value):
        value = value.strip().lower()
        return v.unique_insensible(Utilisateur.objects, 'username', value, self.instance, 'Cet e-mail est déjà utilisé.')

    def validate_personne_id(self, personne):
        compte = Utilisateur.objects.filter(personne=personne)
        if self.instance:
            compte = compte.exclude(pk=self.instance.pk)
        if compte.exists():
            raise serializers.ValidationError('Cette personne a déjà un compte utilisateur.')
        return v.actif(personne, 'Cette personne')

    def validate(self, attrs):
        password = attrs.get('password')
        if self.instance is None and not password:
            raise serializers.ValidationError({'password': 'Le mot de passe est obligatoire.'})
        if self.instance is None and 'personne' not in attrs:
            manquants = {champ: message for champ, message in (
                ('prenom', 'Le prénom est obligatoire.'), ('nom_personne', 'Le nom est obligatoire.')) if not attrs.get(champ)}
            if manquants:
                raise serializers.ValidationError(manquants)
        if 'campements_ids' in attrs:
            ids = list(dict.fromkeys(attrs['campements_ids']))
            trouves = set(Campement.objects.filter(pk__in=ids).values_list('pk', flat=True))
            if trouves != set(ids):
                raise serializers.ValidationError({'campements_ids': 'Campement introuvable.'})
            attrs['campements_ids'] = ids
        if self.instance and attrs.get('actif') is False and self.instance.actif                 and self.instance.personne.campements_responsable.exists():
            raise serializers.ValidationError({'actif': (
                "Ce compte est responsable de campement : désignez d'abord un autre responsable "
                "(fiche du campement) avant de le désactiver.")})
        if password:
            try:
                validate_password(password)
            except DjangoValidationError as exc:
                raise serializers.ValidationError({'password': list(exc.messages)})
        request = self.context.get('request')
        if self.instance and request and request.user.pk == self.instance.pk:
            if attrs.get('actif') is False:
                raise serializers.ValidationError({'actif': 'Vous ne pouvez pas désactiver votre propre compte.'})
            if 'role' in attrs and attrs['role'].code != RoleUtilisateur.BIG_BOSS:
                raise serializers.ValidationError({'role': 'Vous ne pouvez pas retirer votre propre rôle Big Boss.'})
        return attrs

    @staticmethod
    def confier_campements(personne, ids):
        """Confie des campements à ce responsable (ils changent de responsable ; un campement n'est jamais sans responsable)."""
        if not ids:
            return
        Campement.objects.filter(pk__in=ids).update(responsable=personne)
        if personne.bloc_id is None:  # sa fiche du personnel est rattachée au campement (premier confié), pas à un bloc
            personne.campement_id = ids[0]
            personne.save(update_fields=['campement'])

    def create(self, validated_data):
        from apps.core.serializers import PersonneSerializer

        validated_data['password_hash'] = make_password(validated_data.pop('password'))
        prenom = validated_data.pop('prenom', '')
        nom = validated_data.pop('nom_personne', '')
        telephone = validated_data.pop('telephone', '')
        campements_ids = validated_data.pop('campements_ids', [])
        if 'personne' not in validated_data:
            # Création du compte et de la personne du personnel en une seule fois (le rôle donne la fonction)
            fonction = 'Superviseur' if validated_data['role'].code == RoleUtilisateur.SUPERVISEUR else 'Direction'
            donnees = {'prenom': prenom, 'nom': nom, 'telephone': telephone, 'fonction_libelle': fonction}
            if campements_ids:
                donnees['campement_id'] = campements_ids[0]
            # Un responsable n'a pas besoin d'être rattaché à un bloc : sa fiche suit ses campements (ou aucun pour l'instant)
            personne = PersonneSerializer(data=donnees, context={**self.context, 'sans_campement': True})
            if not personne.is_valid():
                # Chaque erreur de la fiche du personnel s'affiche sous SON champ du formulaire de compte
                champs = {'nom': 'nom_personne', 'prenom': 'prenom', 'telephone': 'telephone', 'campement_id': 'campements_ids'}
                raise serializers.ValidationError({champs.get(champ, 'nom_personne'): message for champ, message in personne.errors.items()})
            validated_data['personne'] = personne.save()
        compte = super().create(validated_data)
        self.confier_campements(compte.personne, campements_ids)
        return compte

    def update(self, instance, validated_data):
        for champ in ('prenom', 'nom_personne', 'telephone'):
            validated_data.pop(champ, None)  # champs réservés à la création du compte
        campements_ids = validated_data.pop('campements_ids', [])
        password = validated_data.pop('password', None)
        if password:
            instance.password_hash = make_password(password)
        # Mot de passe, rôle ou état du compte modifié : les sessions déjà ouvertes cessent de valoir
        if password or ('role' in validated_data and validated_data['role'].pk != instance.role_id)                 or ('actif' in validated_data and validated_data['actif'] != instance.actif):
            instance.token_version += 1
        compte = super().update(instance, validated_data)
        self.confier_campements(compte.personne, campements_ids)  # ajout de campements (jamais de retrait : on désigne un autre responsable)
        return compte


class JournalSerializer(serializers.ModelSerializer):
    utilisateur = serializers.SerializerMethodField()
    entite = serializers.CharField(source='table_concernee')
    timestamp = serializers.DateTimeField(source='date_action')

    class Meta:
        model = Journal
        fields = ['id', 'timestamp', 'utilisateur', 'action', 'entite', 'objet_id', 'details', 'adresse_ip']

    def get_utilisateur(self, obj):
        return obj.utilisateur.nom_complet if obj.utilisateur else 'Système'
