import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon,
  ChevronRight as ChevronRightIcon,
} from 'lucide-react';
import {
  format, addMonths, subMonths, addDays, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, parseISO, isBefore, startOfDay,
} from 'date-fns';
import { getGuestHouseCalendar } from '../../api/guesthouse';
import toast from 'react-hot-toast';
import AppLoader from '../../components/AppLoader';
import { formatCollectDue, hasCollectDue } from '../../utils/currency';
import { formatHijriDayMonth, formatHijriLong, formatHijriMonthRange } from '../../utils/hijri';
import { useShowHijriCalendar } from '../../hooks/useShowHijriCalendar';
import { usePermissions } from '../../hooks/usePermissions';
import StatusBadge from '../../components/ui/StatusBadge';
import CancelStayModal from '../../components/guesthouse/CancelStayModal';
import StayQuickViewModal from '../../components/guesthouse/StayQuickViewModal';

const STATUS_COLORS = {
  PENDING: '#fbbf24',
  CONFIRMED: '#22c55e',
  CHECKED_IN: '#3b82f6',
  CHECKED_OUT: '#94a3b8',
  CANCELLED: '#ef4444',
};

export default function StayCalendar() {
  const navigate = useNavigate();
  const { canOperate, canAccessPayments, canCancelStay } = usePermissions();
  const [showHijri] = useShowHijriCalendar();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [stays, setStays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStay, setSelectedStay] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const fetchCal = async () => {
    setLoading(true);
    try {
      const calData = await getGuestHouseCalendar({
        start: format(calStart, 'yyyy-MM-dd'),
        end: format(calEnd, 'yyyy-MM-dd'),
      });
      setStays(
        (calData.stays || []).map((s) => ({
          ...s,
          checkInObj: parseISO(s.check_in),
          checkOutObj: parseISO(s.check_out),
        })),
      );
    } catch {
      toast.error('Failed to load calendar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCal(); }, [currentDate]);

  const staysOnDay = (day) => stays.filter((s) => {
    const d = format(day, 'yyyy-MM-dd');
    return s.check_in <= d && s.check_out > d;
  });

  const goToBook = (date = null) => {
    if (!canOperate) {
      toast.error('You do not have permission to create stays.');
      return;
    }
    const checkIn = date ? format(date, 'yyyy-MM-dd') : format(selectedDate, 'yyyy-MM-dd');
    const checkOut = format(addDays(date || selectedDate, 1), 'yyyy-MM-dd');
    navigate(`/gh/book?check_in=${checkIn}&check_out=${checkOut}`);
  };

  const isFutureDay = (day) => !isBefore(startOfDay(day), startOfDay(new Date()));

  const stayDue = (s) => Math.max(0, Number(s.total_amount) - Number(s.advance_paid));

  const selectedDayStays = staysOnDay(selectedDate);

  return (
    <div className="animate-fade-in">
      <div className="calendar-layout">
        <div className="premium-card stay-calendar">
          <div className="stay-calendar__toolbar">
            <div>
              <h3 className="stay-calendar__month">{format(currentDate, 'MMMM yyyy')}</h3>
              {showHijri && (
                <p className="calendar-hijri-month" lang="ar" dir="rtl">{formatHijriMonthRange(monthStart, monthEnd)}</p>
              )}
            </div>
            <div className="stay-calendar__toolbar-actions">
              <div className="stay-calendar__nav">
                <button type="button" className="btn-secondary" onClick={() => setCurrentDate(subMonths(currentDate, 1))} aria-label="Previous month"><ChevronLeft /></button>
                <button type="button" className="btn-secondary" onClick={() => setCurrentDate(addMonths(currentDate, 1))} aria-label="Next month"><ChevronRight /></button>
              </div>
              {canOperate && (
                <button
                  type="button"
                  className="btn-primary stay-calendar__book-btn"
                  onClick={() => goToBook()}
                >
                  <Plus size={16} aria-hidden />
                  <span>Reservation</span>
                </button>
              )}
            </div>
          </div>

          <div className="stay-calendar__weekdays">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="stay-calendar__weekday">{d}</div>
            ))}
          </div>

          {loading ? (
            <AppLoader inline message="Loading calendar…" />
          ) : (
            <div className="stay-calendar__grid">
              {days.map((day) => {
                const dayStays = staysOnDay(day);
                const selected = isSameDay(day, selectedDate);
                const future = isFutureDay(day);
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    className={`stay-calendar__day${selected ? ' stay-calendar__day--selected' : ''}${!isSameMonth(day, currentDate) ? ' stay-calendar__day--muted' : ''}`}
                    onClick={() => setSelectedDate(day)}
                    onDoubleClick={() => future && canOperate && goToBook(day)}
                  >
                    <span className="stay-calendar__day-top">
                      <span className="calendar-day-nums">
                        <span>{format(day, 'd')}</span>
                        {showHijri && (
                          <span className="calendar-day-hijri" lang="ar" dir="rtl">{formatHijriDayMonth(day)}</span>
                        )}
                      </span>
                      {future && isSameMonth(day, currentDate) && canOperate && (
                        <Plus size={12} color="var(--primary)" />
                      )}
                    </span>
                    <div className="stay-calendar__day-stays">
                      {dayStays.slice(0, 4).map((s) => (
                        <span
                          key={s.id}
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); setSelectedStay(s); }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.stopPropagation();
                              e.preventDefault();
                              setSelectedStay(s);
                            }
                          }}
                          className="stay-calendar__stay-chip"
                          style={{ background: STATUS_COLORS[s.status] || '#94a3b8' }}
                          title={`${s.customer_name} · Room ${s.room_number}`}
                        >
                          {s.customer_name || s.room_number}
                        </span>
                      ))}
                      {dayStays.length > 4 && <span className="stay-calendar__stay-more">+{dayStays.length - 4}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="premium-card stay-calendar__sidebar">
          <h4 className="stay-calendar__sidebar-title">
            <CalendarIcon size={18} aria-hidden />
            {format(selectedDate, 'EEEE, MMM d, yyyy')}
            {isFutureDay(selectedDate) && (
              <span className="stay-calendar__future-badge">Future</span>
            )}
          </h4>
          {showHijri && (
            <p className="calendar-hijri-selected" lang="ar" dir="rtl">{formatHijriLong(selectedDate)}</p>
          )}
          {selectedDayStays.length === 0 ? (
            <div className="stay-calendar__sidebar-empty">
              <p>No stays on this date.</p>
              {canOperate && (
                <button
                  type="button"
                  className="btn-primary stay-calendar__sidebar-book"
                  onClick={() => goToBook(selectedDate)}
                >
                  <Plus size={16} aria-hidden />
                  Book stay for this date
                </button>
              )}
            </div>
          ) : (
            <ul className="stay-calendar__sidebar-list">
              {selectedDayStays.map((s) => {
                const due = stayDue(s);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={`stay-calendar__sidebar-item${selectedStay?.id === s.id ? ' stay-calendar__sidebar-item--active' : ''}`}
                      onClick={() => setSelectedStay(s)}
                    >
                      <div className="stay-calendar__sidebar-item-body">
                        <p className="stay-calendar__sidebar-customer">{s.customer_name}</p>
                        <p className="stay-calendar__sidebar-ref">{s.booking_ref}</p>
                        <p className="stay-calendar__sidebar-room">Room {s.room_number}</p>
                        <div className="stay-calendar__sidebar-meta">
                          <StatusBadge status={s.status} />
                          {hasCollectDue(due) && (
                            <span className="stay-calendar__sidebar-due">
                              Due {formatCollectDue(due)}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRightIcon size={18} color="var(--text-muted)" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <StayQuickViewModal
        stay={selectedStay}
        onClose={() => setSelectedStay(null)}
        onCancel={(stay) => {
          setCancelTarget(stay);
          setSelectedStay(null);
        }}
        canAccessPayments={canAccessPayments}
        canCancelStay={canCancelStay}
      />

      <CancelStayModal
        stay={cancelTarget}
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onCancelled={() => {
          setCancelTarget(null);
          fetchCal();
        }}
      />
    </div>
  );
}
