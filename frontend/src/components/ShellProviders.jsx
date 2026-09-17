import { useAppType } from '../hooks/useAppType';
import { GhPageVisibilityProvider } from '../context/GhPageVisibilityContext';
import { HallPageVisibilityProvider } from '../context/HallPageVisibilityContext';
import { NotificationsProvider } from '../hooks/useNotifications';

/** Shared dashboard data — stays mounted across page changes so APIs are not refetched. */
export default function ShellProviders({ children }) {
  const { isGuestHouse, isAuthenticated, loading } = useAppType();

  if (loading || !isAuthenticated) return children;

  return (
    <GhPageVisibilityProvider enabled={isGuestHouse}>
      <HallPageVisibilityProvider enabled={!isGuestHouse}>
        <NotificationsProvider>
          {children}
        </NotificationsProvider>
      </HallPageVisibilityProvider>
    </GhPageVisibilityProvider>
  );
}
