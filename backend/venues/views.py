from rest_framework import viewsets, filters, status
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from core.mixins import TenantQuerysetMixin, TenantAssignMixin
from core.permissions import IsAdminOrManagerOrReadOnly, IsTenantOwner, IsMarriageHallApp
from .models import Venue
from .serializers import VenueSerializer


class VenueViewSet(TenantQuerysetMixin, TenantAssignMixin, viewsets.ModelViewSet):
    queryset = Venue.objects.all().order_by('name')
    serializer_class = VenueSerializer
    permission_classes = [IsMarriageHallApp, IsAdminOrManagerOrReadOnly, IsTenantOwner]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status']
    search_fields = ['name', 'location']
    ordering_fields = ['price_per_day', 'capacity', 'created_at']

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.request.query_params.get('include_inactive') != '1':
            queryset = queryset.exclude(status='INACTIVE')
        return queryset

    def destroy(self, request, *args, **kwargs):
        venue = self.get_object()
        if venue.bookings.exists():
            venue.status = 'INACTIVE'
            venue.save(update_fields=['status', 'updated_at'])
            return Response({
                'detail': 'Hall archived because it has booking history.',
                'archived': True,
            }, status=status.HTTP_200_OK)

        self.perform_destroy(venue)
        return Response(status=status.HTTP_204_NO_CONTENT)
