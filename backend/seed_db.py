import os
import django
from datetime import timedelta
import random

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'hallora_backend.settings')
django.setup()

from django.utils import timezone

from core.models import Tenant
from authentication.models import User, StaffProfile
from venues.models import Venue
from customers.models import Customer
from bookings.models import Booking
from finance.models import Payment, Expense

def seed_db():
    print("Seeding fresh data for modular architecture...")
    
    # 1. Create Tenant
    tenant, _ = Tenant.objects.get_or_create(
        subdomain="gateway",
        defaults={
            "name": "Gateway Marriage Hall",
            "plan_type": "PREMIUM"
        }
    )

    # 2. Create Admin User
    if not User.objects.filter(username="admin").exists():
        admin = User.objects.create_superuser(
            username="admin",
            email="admin@gateway.com",
            password="admin123",
            first_name="Alex",
            last_name="Admin",
            role="ADMIN",
            tenant=tenant
        )
        print(f"Created Admin: username {admin.username} / admin123")
    else:
        admin = User.objects.get(username="admin")

    # 3. Create Venues
    venues_data = [
        {"name": "Grand Ballroom", "location": "Main Floor", "capacity": 500, "price": 2500},
        {"name": "Crystal Garden", "location": "East Wing", "capacity": 300, "price": 1800},
        {"name": "Royal Suite", "location": "Penthouse", "capacity": 150, "price": 1200}
    ]
    
    venues = []
    for v_data in venues_data:
        v, _ = Venue.objects.get_or_create(
            tenant=tenant,
            name=v_data["name"],
            defaults={
                "location": v_data["location"],
                "capacity": v_data["capacity"],
                "price_per_day": v_data["price"],
                "status": "ACTIVE"
            }
        )
        venues.append(v)

    # 4. Create Customers (Pakistani demo hosts)
    customers_data = [
        {"first": "Muhammad Usman", "last": "Khan", "email": "usman.khan@email.com", "phone": "03001234501", "full": "Muhammad Usman Khan"},
        {"first": "Ayesha", "last": "Siddiqui", "email": "ayesha.siddiqui@email.com", "phone": "03011234502", "full": "Ayesha Siddiqui"},
        {"first": "Bilal Ahmed", "last": "Qureshi", "email": "bilal.qureshi@email.com", "phone": "03211234503", "full": "Bilal Ahmed Qureshi"},
    ]
    
    customers = []
    for c_data in customers_data:
        c, _ = Customer.objects.get_or_create(
            tenant=tenant,
            phone=c_data["phone"],
            defaults={
                "full_name": c_data["full"],
                "first_name": c_data["first"],
                "last_name": c_data["last"],
                "email": c_data["email"],
            }
        )
        customers.append(c)

    # 5. Create Bookings & Payments
    today = timezone.now()
    for i in range(5):
        v = random.choice(venues)
        c = random.choice(customers)
        event_day = (today + timedelta(days=random.randint(-10, 30))).date()
        slot = random.choice(['morning', 'evening'])

        booking, created = Booking.objects.get_or_create(
            tenant=tenant,
            venue=v,
            event_name=f"Event {i+1}",
            defaults={
                "customer": c,
                "event_date": event_day,
                "slot": slot,
                "guest_count": random.randint(50, 300),
                "total_price": v.price_per_day,
                "advance_paid": 500 if i % 2 == 0 else v.price_per_day,
                "booking_status": "CONFIRMED",
                "created_by": admin,
            }
        )
        
        if created:
            # Create Payment record
            Payment.objects.create(
                tenant=tenant,
                booking=booking,
                amount=booking.advance_paid,
                payment_method="CASH",
                status="COMPLETED"
            )

    # 6. Create Expenses
    Expense.objects.get_or_create(
        tenant=tenant,
        title="AC Maintenance",
        defaults={"category": "MAINTENANCE", "amount": 450, "expense_date": today.date(), "created_by": admin}
    )

    print("Seeding complete! You can now log in.")

if __name__ == "__main__":
    seed_db()
