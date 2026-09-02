import { useAuth } from '../context/AuthContext';
import { useAppType } from './useAppType';

/**
 * Central role checks - use everywhere instead of inline user?.role.
 * Unknown/missing role is treated as STAFF (least privilege).
 */
export function usePermissions() {
  const { user, loading, isAuthenticated } = useAuth();
  const { isGuestHouse } = useAppType();
  const cachedRole =
    typeof window !== 'undefined' ? localStorage.getItem('user_role') : '';
  const role = String(user?.role || cachedRole || '').toUpperCase();

  const isAdmin = role === 'ADMIN';
  const isManager = role === 'MANAGER';
  const isStaff =
    role === 'STAFF' ||
    (isAuthenticated && !loading && user && !isAdmin && !isManager);

  const canManage = isAdmin || isManager;
  const canOperate = canManage || isStaff;
  const canCancelStay = isAdmin || isManager || isStaff;
  const canAccessPayments = canManage || isStaff;

  return {
    user,
    loading,
    role: role || 'STAFF',
    isAdmin,
    isManager,
    isStaff,
    isGuestHouse,
    canManage,
    canOperate,
    canCancelStay,
    canAccessExpenses: canManage,
    canAccessReports: canManage,
    canAccessNotifications: canManage,
    canAccessStaff: isAdmin,
    canAccessSettings: canManage,
    canAccessDashboard: canManage,
    canAccessPayments,
  };
}
