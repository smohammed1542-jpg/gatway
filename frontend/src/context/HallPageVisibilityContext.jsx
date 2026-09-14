import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { getHallPageVisibility } from '../api/bookings';
import { HALL_PAGE_ORDER, HALL_PAGE_PATHS } from '../constants/hallPages';
import { isMaintenanceExpired } from '../utils/maintenanceTime';

function applyHallVisibilityData(data) {
  const map = {};
  const maintMap = {};
  const untilMap = {};
  const moduleMap = {};
  const moduleMaintMap = {};
  const moduleUntilMap = {};
  (data?.pages || []).forEach((page) => {
    map[page.key] = page.is_visible === true;
    maintMap[page.key] = page.in_maintenance === true;
    untilMap[page.key] = page.maintenance_until ?? null;
  });
  (data?.modules || []).forEach((mod) => {
    moduleMap[mod.key] = mod.is_visible === true;
    moduleMaintMap[mod.key] = mod.in_maintenance === true;
    moduleUntilMap[mod.key] = mod.maintenance_until ?? null;
  });
  return {
    map,
    maintMap,
    untilMap,
    moduleMap,
    moduleMaintMap,
    moduleUntilMap,
  };
}

const HallPageVisibilityContext = createContext({
  loading: true,
  visibility: null,
  maintenance: null,
  maintenanceUntil: null,
  moduleVisibility: null,
  moduleMaintenance: null,
  moduleMaintenanceUntil: null,
  isPageVisible: () => true,
  isPageInMaintenance: () => false,
  getPageMaintenanceUntil: () => null,
  isModuleVisible: () => true,
  isModuleInMaintenance: () => false,
  firstVisiblePath: '/bookings',
  reload: () => {},
});

export function HallPageVisibilityProvider({ enabled = true, children }) {
  const [loading, setLoading] = useState(enabled);
  const [visibility, setVisibility] = useState(null);
  const [maintenance, setMaintenance] = useState(null);
  const [maintenanceUntil, setMaintenanceUntil] = useState(null);
  const [moduleVisibility, setModuleVisibility] = useState(null);
  const [moduleMaintenance, setModuleMaintenance] = useState(null);
  const [moduleMaintenanceUntil, setModuleMaintenanceUntil] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [tick, setTick] = useState(0);
  const expirySyncRef = useRef(false);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  const syncVisibility = useCallback(() => {
    if (!enabled) return Promise.resolve();
    return getHallPageVisibility()
      .then((data) => {
        const parsed = applyHallVisibilityData(data);
        setVisibility(parsed.map);
        setMaintenance(parsed.maintMap);
        setMaintenanceUntil(parsed.untilMap);
        setModuleVisibility(parsed.moduleMap);
        setModuleMaintenance(parsed.moduleMaintMap);
        setModuleMaintenanceUntil(parsed.moduleUntilMap);
        expirySyncRef.current = false;
      })
      .catch(() => {});
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setVisibility(null);
      setMaintenance(null);
      setMaintenanceUntil(null);
      setModuleVisibility(null);
      setModuleMaintenance(null);
      setModuleMaintenanceUntil(null);
      return undefined;
    }

    let active = true;
    setLoading(true);
    getHallPageVisibility()
      .then((data) => {
        if (!active) return;
        const parsed = applyHallVisibilityData(data);
        setVisibility(parsed.map);
        setMaintenance(parsed.maintMap);
        setMaintenanceUntil(parsed.untilMap);
        setModuleVisibility(parsed.moduleMap);
        setModuleMaintenance(parsed.moduleMaintMap);
        setModuleMaintenanceUntil(parsed.moduleUntilMap);
        expirySyncRef.current = false;
      })
      .catch(() => {
        if (!active) return;
        setVisibility(null);
        setMaintenance(null);
        setMaintenanceUntil(null);
        setModuleVisibility(null);
        setModuleMaintenance(null);
        setModuleMaintenanceUntil(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [enabled, tick]);

  useEffect(() => {
    const hasScheduled = maintenanceUntil
      && Object.values(maintenanceUntil).some((until) => until && !isMaintenanceExpired(until));
    if (!hasScheduled) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [maintenanceUntil]);

  useEffect(() => {
    if (!maintenance || !maintenanceUntil || expirySyncRef.current) return;

    const expiredKeys = Object.keys(maintenance).filter((key) => (
      maintenance[key] === true
      && maintenanceUntil[key]
      && isMaintenanceExpired(maintenanceUntil[key])
    ));
    const expiredModules = moduleMaintenance && moduleMaintenanceUntil
      ? Object.keys(moduleMaintenance).filter((key) => (
        moduleMaintenance[key] === true
        && moduleMaintenanceUntil[key]
        && isMaintenanceExpired(moduleMaintenanceUntil[key])
      ))
      : [];

    if (!expiredKeys.length && !expiredModules.length) return;

    expirySyncRef.current = true;
    setMaintenance((current) => {
      const next = { ...current };
      expiredKeys.forEach((key) => { next[key] = false; });
      return next;
    });
    setMaintenanceUntil((current) => {
      const next = { ...current };
      expiredKeys.forEach((key) => { next[key] = null; });
      return next;
    });
    if (expiredModules.length) {
      setModuleMaintenance((current) => {
        const next = { ...current };
        expiredModules.forEach((key) => { next[key] = false; });
        return next;
      });
      setModuleMaintenanceUntil((current) => {
        const next = { ...current };
        expiredModules.forEach((key) => { next[key] = null; });
        return next;
      });
    }
    syncVisibility();
  }, [now, maintenance, maintenanceUntil, moduleMaintenance, moduleMaintenanceUntil, syncVisibility]);

  const value = useMemo(() => {
    const isActiveMaintenance = (active, until) => {
      if (!active) return false;
      if (until && isMaintenanceExpired(until)) return false;
      return true;
    };

    const isPageVisible = (pageKey) => {
      if (visibility === null) return true;
      return visibility[pageKey] !== false;
    };

    const getPageMaintenanceUntil = (pageKey) => {
      if (maintenanceUntil === null) return null;
      return maintenanceUntil[pageKey] || null;
    };

    const isPageInMaintenance = (pageKey) => {
      if (maintenance === null) return false;
      return isActiveMaintenance(
        maintenance[pageKey] === true,
        getPageMaintenanceUntil(pageKey),
      );
    };

    const isModuleVisible = (moduleKey) => {
      if (moduleVisibility === null) return true;
      return moduleVisibility[moduleKey] !== false;
    };

    const isModuleInMaintenance = (moduleKey) => {
      if (moduleMaintenance === null) return false;
      const until = moduleMaintenanceUntil?.[moduleKey] || null;
      return isActiveMaintenance(moduleMaintenance[moduleKey] === true, until);
    };

    const firstVisiblePath = HALL_PAGE_ORDER
      .map((key) => (isPageVisible(key) ? HALL_PAGE_PATHS[key] : null))
      .find(Boolean) || '/bookings';

    return {
      loading,
      visibility,
      maintenance,
      maintenanceUntil,
      moduleVisibility,
      moduleMaintenance,
      moduleMaintenanceUntil,
      isPageVisible,
      isPageInMaintenance,
      getPageMaintenanceUntil,
      isModuleVisible,
      isModuleInMaintenance,
      firstVisiblePath,
      reload,
      syncVisibility,
    };
  }, [
    loading,
    visibility,
    maintenance,
    maintenanceUntil,
    moduleVisibility,
    moduleMaintenance,
    moduleMaintenanceUntil,
    now,
    reload,
    syncVisibility,
  ]);

  return (
    <HallPageVisibilityContext.Provider value={value}>
      {children}
    </HallPageVisibilityContext.Provider>
  );
}

export function useHallPageVisibility() {
  return useContext(HallPageVisibilityContext);
}
