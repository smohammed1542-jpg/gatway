from rest_framework import serializers

from .models import (
    Account,
    AuditLog,
    BankAccount,
    BankReconciliation,
    BankTransfer,
    CostCenter,
    FiscalPeriod,
    Invoice,
    JournalEntry,
    JournalLine,
    Tax,
    Vendor,
    VendorBill,
    VendorPayment,
)


class AccountSerializer(serializers.ModelSerializer):
    parent_code = serializers.CharField(source='parent.code', read_only=True, default=None)
    has_transactions = serializers.SerializerMethodField()

    class Meta:
        model = Account
        fields = [
            'id', 'code', 'name', 'account_type', 'parent', 'parent_code',
            'description', 'is_active', 'is_system', 'has_transactions',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'is_system', 'created_at', 'updated_at']

    def get_has_transactions(self, obj):
        return obj.journal_lines.exists()


class TaxSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tax
        fields = [
            'id', 'name', 'rate', 'tax_account', 'is_default', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class FiscalPeriodSerializer(serializers.ModelSerializer):
    class Meta:
        model = FiscalPeriod
        fields = ['id', 'name', 'start_date', 'end_date', 'is_closed', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class JournalLineSerializer(serializers.ModelSerializer):
    account_code = serializers.CharField(source='account.code', read_only=True)
    account_name = serializers.CharField(source='account.name', read_only=True)
    account_id = serializers.IntegerField(source='account.id', read_only=True)

    class Meta:
        model = JournalLine
        fields = [
            'id', 'account', 'account_id', 'account_code', 'account_name',
            'description', 'debit', 'credit',
            'customer', 'vendor', 'booking', 'stay', 'bank_account', 'reconciled',
        ]


class JournalLineWriteSerializer(serializers.Serializer):
    account_code = serializers.CharField(required=False, allow_blank=True)
    account = serializers.IntegerField(required=False)
    description = serializers.CharField(required=False, allow_blank=True, default='')
    debit = serializers.DecimalField(max_digits=14, decimal_places=2, default=0)
    credit = serializers.DecimalField(max_digits=14, decimal_places=2, default=0)
    customer = serializers.IntegerField(required=False, allow_null=True)
    vendor = serializers.IntegerField(required=False, allow_null=True)
    booking = serializers.IntegerField(required=False, allow_null=True)
    stay = serializers.IntegerField(required=False, allow_null=True)
    bank_account = serializers.IntegerField(required=False, allow_null=True)


class JournalEntrySerializer(serializers.ModelSerializer):
    lines = JournalLineSerializer(many=True, read_only=True)
    created_by_name = serializers.SerializerMethodField()
    total_debit = serializers.SerializerMethodField()
    total_credit = serializers.SerializerMethodField()

    class Meta:
        model = JournalEntry
        fields = [
            'id', 'entry_no', 'entry_date', 'memo', 'source_type', 'source_id',
            'status', 'reversed_entry', 'created_by', 'created_by_name',
            'created_at', 'updated_at', 'lines', 'total_debit', 'total_credit',
        ]
        read_only_fields = [
            'id', 'entry_no', 'status', 'reversed_entry', 'created_by',
            'created_at', 'updated_at', 'lines', 'total_debit', 'total_credit',
        ]

    def get_created_by_name(self, obj):
        user = obj.created_by
        if not user:
            return ''
        name = f'{user.first_name or ""} {user.last_name or ""}'.strip()
        return name or user.username or ''

    def get_total_debit(self, obj):
        return sum((l.debit for l in obj.lines.all()), 0)

    def get_total_credit(self, obj):
        return sum((l.credit for l in obj.lines.all()), 0)


class JournalEntryCreateSerializer(serializers.Serializer):
    entry_date = serializers.DateField()
    memo = serializers.CharField(required=False, allow_blank=True, default='')
    source_type = serializers.CharField(required=False, default='manual')
    post_immediately = serializers.BooleanField(default=False)
    lines = JournalLineWriteSerializer(many=True)
    reason = serializers.CharField(required=False, allow_blank=True, default='')


class AuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            'id', 'action', 'entity_type', 'entity_id', 'message', 'reason',
            'previous_value', 'new_value', 'actor', 'actor_name', 'created_at',
        ]
        read_only_fields = fields

    def get_actor_name(self, obj):
        user = obj.actor
        if not user:
            return ''
        name = f'{user.first_name or ""} {user.last_name or ""}'.strip()
        return name or user.username or ''


class VendorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vendor
        fields = [
            'id', 'name', 'phone', 'email', 'address', 'tax_info',
            'opening_balance', 'notes', 'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class VendorBillSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    expense_account_code = serializers.CharField(source='expense_account.code', read_only=True)
    balance_due = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = VendorBill
        fields = [
            'id', 'vendor', 'vendor_name', 'bill_no', 'bill_date', 'due_date',
            'expense_account', 'expense_account_code', 'amount', 'amount_paid',
            'balance_due', 'description', 'status', 'created_by',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'bill_no', 'amount_paid', 'status', 'created_by', 'created_at', 'updated_at']


class VendorPaymentSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)

    class Meta:
        model = VendorPayment
        fields = [
            'id', 'vendor', 'vendor_name', 'bill', 'payment_no', 'payment_date',
            'amount', 'payment_method', 'bank_account', 'notes', 'status',
            'created_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'payment_no', 'status', 'created_by', 'created_at', 'updated_at']


class BankAccountSerializer(serializers.ModelSerializer):
    gl_account_code = serializers.CharField(source='gl_account.code', read_only=True)
    masked_account_number = serializers.CharField(read_only=True)

    class Meta:
        model = BankAccount
        fields = [
            'id', 'bank_name', 'account_name', 'account_number', 'masked_account_number',
            'gl_account', 'gl_account_code', 'opening_balance', 'is_default', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class BankTransferSerializer(serializers.ModelSerializer):
    from_account_code = serializers.CharField(source='from_account.code', read_only=True)
    to_account_code = serializers.CharField(source='to_account.code', read_only=True)

    class Meta:
        model = BankTransfer
        fields = [
            'id', 'transfer_date', 'amount', 'from_account', 'to_account',
            'from_account_code', 'to_account_code', 'from_bank', 'to_bank',
            'memo', 'status', 'created_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'status', 'created_by', 'created_at', 'updated_at']


class BankReconciliationSerializer(serializers.ModelSerializer):
    bank_account_name = serializers.SerializerMethodField()

    class Meta:
        model = BankReconciliation
        fields = [
            'id', 'bank_account', 'bank_account_name', 'statement_date',
            'statement_balance', 'book_balance', 'difference', 'status',
            'notes', 'completed_at', 'created_by', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'book_balance', 'difference', 'status', 'completed_at',
            'created_by', 'created_at', 'updated_at',
        ]

    def get_bank_account_name(self, obj):
        if not obj.bank_account_id:
            return ''
        return str(obj.bank_account)


class InvoiceSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    balance_due = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    booking_ref = serializers.CharField(source='booking.booking_id', read_only=True, default=None)

    class Meta:
        model = Invoice
        fields = [
            'id', 'invoice_no', 'customer', 'customer_name', 'booking', 'booking_ref',
            'stay', 'invoice_date', 'due_date', 'status', 'subtotal', 'discount',
            'tax', 'total', 'amount_paid', 'balance_due', 'notes',
            'created_by', 'created_at', 'updated_at',
        ]
        read_only_fields = fields

    def get_customer_name(self, obj):
        if not obj.customer_id:
            return ''
        return obj.customer.display_name


class CostCenterSerializer(serializers.ModelSerializer):
    class Meta:
        model = CostCenter
        fields = ['id', 'code', 'name', 'kind', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class OpeningBalanceSerializer(serializers.Serializer):
    entry_date = serializers.DateField(required=False)
    memo = serializers.CharField(required=False, default='Opening balances')
    lines = JournalLineWriteSerializer(many=True)
