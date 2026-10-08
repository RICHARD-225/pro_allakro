from django.contrib import admin
from django.urls import include, path

from apps.accounts.urls import auth_urlpatterns

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/auth/', include(auth_urlpatterns)),
    path('api/v1/', include('apps.accounts.urls')),
    path('api/v1/', include('apps.core.urls')),
    path('api/v1/', include('apps.exploitation.urls')),
    path('api/v1/', include('apps.finances.urls')),
    path('api/v1/', include('apps.stock.urls')),
    path('api/v1/', include('apps.achats.urls')),
]
