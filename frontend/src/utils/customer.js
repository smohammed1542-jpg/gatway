import { formatPakPhone, validatePakPhone } from './phone';
import { cnicDigits, formatCnic, validateCnic } from './cnicScanner';

export const GENDER_OPTIONS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
];

export const FEMALE_RELATION_OPTIONS = [
  { value: 'HUSBAND', label: 'Husband' },
  { value: 'FATHER', label: 'Father' },
  { value: 'SON', label: 'Son' },
  { value: 'OTHER', label: 'Other' },
];

export const relativeFieldLabel = (gender, relation) => {
  if (gender === 'MALE') return 'Father name';
  const map = {
    HUSBAND: 'Husband name',
    FATHER: 'Father name',
    SON: 'Son name',
    OTHER: 'Relative name',
  };
  return map[relation] || 'Relative name';
};

/** Display name for customer records (supports legacy first/last). */
export const customerDisplayName = (customer) => {
  if (!customer) return '';
  if (customer.full_name?.trim()) return customer.full_name.trim();
  return `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
};

export const customerCode = (customer) => {
  const raw = customer?.customer_code
    || (customer?.id ? String(customer.id).padStart(5, '0') : '');
  return String(raw).replace(/^cust-/i, '');
};

export const customerInitials = (customer) => {
  const name = customerDisplayName(customer);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return (name.slice(0, 2) || '?').toUpperCase();
};

export const buildCustomerPayload = ({
  full_name,
  cnic,
  email,
  phone,
  address,
  notes,
  gender,
  relative_relation,
  relative_name,
  is_minor,
  linked_primary,
}) => {
  const nextGender = (gender || '').trim().toUpperCase();
  const nextRelation = nextGender === 'MALE'
    ? 'FATHER'
    : (relative_relation || '').trim().toUpperCase();

  return {
    full_name: (full_name || '').trim(),
    cnic: cnicDigits(cnic).length === 13 ? formatCnic(cnic) : (cnic || '').trim(),
    phone: formatPakPhone(phone),
    email: (email || '').trim() || null,
    address: (address || '').trim(),
    notes: notes || '',
    gender: nextGender,
    relative_relation: nextGender ? nextRelation : '',
    relative_name: nextGender ? (relative_name || '').trim() : '',
    ...(is_minor ? { is_minor: true } : {}),
    ...(linked_primary ? { linked_primary: Number(linked_primary) } : {}),
  };
};

/** Guest House adult — name, phone, CNIC required; profile extras optional for companions. */
export const validateGhCustomerForm = ({
  full_name,
  cnic,
  phone,
  email,
  gender,
  relative_relation,
  relative_name,
  address,
}, { requireProfileExtras = true } = {}) => {
  const errors = {};
  if (!full_name?.trim()) errors.full_name = 'Name is required.';
  const phoneError = validatePakPhone(phone);
  if (phoneError) errors.phone = phoneError;
  const cnicError = validateCnic(cnic);
  if (cnicError) errors.cnic = cnicError;
  if (email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.email = 'Enter a valid email address.';
  }
  if (requireProfileExtras) {
    if (!gender) {
      errors.gender = 'Select Male or Female.';
    } else if (gender === 'MALE') {
      if (!relative_name?.trim()) errors.relative_name = 'Father name is required.';
    } else if (gender === 'FEMALE') {
      if (!relative_relation) {
        errors.relative_relation = 'Select Husband, Father, Son, or Other.';
      }
      if (!relative_name?.trim()) {
        errors.relative_name = `${relativeFieldLabel(gender, relative_relation)} is required.`;
      }
    }
    if (!address?.trim()) errors.address = 'Permanent address is required.';
  }
  return errors;
};

/** Child guest — child name, father name + father CNIC. */
export const validateUnder3GuestForm = ({ full_name, relative_name, cnic }) => {
  const errors = {};
  if (!full_name?.trim()) errors.full_name = 'Child name is required.';
  if (!relative_name?.trim()) errors.relative_name = 'Father name is required.';
  const cnicError = validateCnic(cnic);
  if (cnicError) errors.cnic = cnicError.replace('CNIC / ID card', 'Father CNIC / ID');
  return errors;
};

/** @deprecated Prefer validateUnder3GuestForm for under-3 guests. */
export const validateMinorGuestForm = ({ full_name, address, relative_name, cnic }) => {
  if (relative_name != null || cnic != null) {
    return validateUnder3GuestForm({
      full_name,
      relative_name: relative_name || full_name,
      cnic,
    });
  }
  const errors = {};
  if (!full_name?.trim()) errors.full_name = 'Name is required.';
  if (!address?.trim()) errors.address = 'Address is required.';
  return errors;
};

export const buildMinorCustomerPayload = ({
  full_name,
  relative_name,
  cnic,
  address,
  linked_primary,
  phone,
}) => {
  const childName = (full_name || '').trim();
  const fatherName = (relative_name || '').trim();
  return {
    full_name: childName,
    relative_name: fatherName,
    relative_relation: 'FATHER',
    cnic: cnicDigits(cnic).length === 13 ? formatCnic(cnic) : (cnic || '').trim(),
    address: (address || '').trim(),
    is_minor: true,
    linked_primary: Number(linked_primary),
    phone: (phone || '').trim() || '—',
    gender: '',
  };
};