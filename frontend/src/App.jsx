import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from './components/DashboardLayout';
import Overview from './pages/dashboard/Overview';
import LandingPage from './pages/LandingPage';
import AboutPage from './pages/AboutPage';
import LoginPage from './pages/LoginPage';
import Bookings from './pages/Bookings';
import BookingDetail from './pages/BookingDetail';
import BookingCalendar from './pages/BookingCalendar';
import CustomerManagement from './pages/CustomerManagement';
import GhCustomers from './pages/guesthouse/GhCustomers';
import Payments from './pages/Payments';
import Expenses from './pages/Expenses';
import ExpenseDetail from './pages/ExpenseDetail';
import Inventory from './pages/Inventory';
import InventoryDetail from './pages/InventoryDetail';
import DecorationPackages from './pages/DecorationPackages';
import DecorationPackageDetail from './pages/DecorationPackageDetail';
import Reports from './pages/Reports';
import JournalEntries from './pages/JournalEntries';
import TrialBalance from './pages/TrialBalance';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import PrintDocument from './pages/PrintDocument';
import Notifications from './pages/Notifications';
import NotFound from './pages/NotFound';
import AppLoader from './components/AppLoader';
import GuestHouseOverview from './pages/guesthouse/Overview';
import RoomFormPage from './pages/guesthouse/RoomFormPage';
import GuestHouseStays from './pages/guesthouse/Stays';
import StayFormPage from './pages/guesthouse/StayFormPage';
import StayDetail from './pages/guesthouse/StayDetail';
import GuestHousePayments from './pages/guesthouse/Payments';
import PaymentFormPage from './pages/guesthouse/PaymentFormPage';
import GuestHouseExpenses from './pages/guesthouse/Expenses';
import ExpenseFormPage from './pages/guesthouse/ExpenseFormPage';
import GhExpenseDetail from './pages/guesthouse/GhExpenseDetail';
import GhPrintExpense from './pages/guesthouse/GhPrintExpense';
import StayCalendar from './pages/guesthouse/StayCalendar';
import GuestHouseReports from './pages/guesthouse/Reports';
import GhPrintStay from './pages/guesthouse/GhPrintStay';
import GhPrintPayment from './pages/guesthouse/GhPrintPayment';
import BookFutureStayPage from './pages/guesthouse/BookFutureStayPage';
import HallFormPage from './pages/HallFormPage';

import ProtectedRoute from './components/ProtectedRoute';
import { AdminRoute, ManagerRoute, StaffBlockedRoute } from './components/RoleRoute';
import { MarriageHallRoute, GuestHouseRoute } from './components/AppTypeRoute';
import { GhPageRoute } from './components/GhPageRoute';
import { HallPageRoute } from './components/HallPageRoute';
import { GH_PAGE_KEYS } from './constants/ghPages';
import { HALL_PAGE_KEYS } from './constants/hallPages';

const ghPage = (pageKey, element) => (
  <GhPageRoute pageKey={pageKey}>{element}</GhPageRoute>
);

const hallPage = (pageKey, element) => (
  <HallPageRoute pageKey={pageKey}>{element}</HallPageRoute>
);

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<Navigate to="/login" replace />} />

        <Route
          path="/print/:bookingId"
          element={
            <ProtectedRoute>
              <MarriageHallRoute>
                <PrintDocument />
              </MarriageHallRoute>
            </ProtectedRoute>
          }
        />

        {/* Marriage Hall app */}
        <Route
          element={
            <ProtectedRoute>
              <MarriageHallRoute>
                <DashboardLayout />
              </MarriageHallRoute>
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={hallPage(HALL_PAGE_KEYS.DASHBOARD, <StaffBlockedRoute><Overview /></StaffBlockedRoute>)} />
          <Route path="/bookings" element={hallPage(HALL_PAGE_KEYS.BOOKINGS, <Bookings />)} />
          <Route path="/bookings/:bookingId" element={hallPage(HALL_PAGE_KEYS.BOOKINGS, <BookingDetail />)} />
          <Route path="/calendar" element={hallPage(HALL_PAGE_KEYS.CALENDAR, <BookingCalendar />)} />
          <Route path="/halls/new" element={hallPage(HALL_PAGE_KEYS.HALLS, <ManagerRoute><HallFormPage /></ManagerRoute>)} />
          <Route path="/halls/:hallId/edit" element={hallPage(HALL_PAGE_KEYS.HALLS, <ManagerRoute><HallFormPage /></ManagerRoute>)} />
          <Route path="/halls" element={<Navigate to="/settings?tab=halls" replace />} />
          <Route path="/customers" element={hallPage(HALL_PAGE_KEYS.CUSTOMERS, <CustomerManagement />)} />
          <Route path="/customers/:customerId" element={hallPage(HALL_PAGE_KEYS.CUSTOMERS, <CustomerManagement />)} />
          <Route path="/payments" element={hallPage(HALL_PAGE_KEYS.PAYMENTS, <ManagerRoute><Payments /></ManagerRoute>)} />
          <Route path="/journal-entries" element={hallPage(HALL_PAGE_KEYS.DASHBOARD, <ManagerRoute><JournalEntries /></ManagerRoute>)} />
          <Route path="/trial-balance" element={hallPage(HALL_PAGE_KEYS.DASHBOARD, <ManagerRoute><TrialBalance /></ManagerRoute>)} />
          <Route path="/expenses" element={hallPage(HALL_PAGE_KEYS.EXPENSES, <ManagerRoute><Expenses /></ManagerRoute>)} />
          <Route path="/expenses/:expenseId" element={hallPage(HALL_PAGE_KEYS.EXPENSES, <ManagerRoute><ExpenseDetail /></ManagerRoute>)} />
          <Route path="/staff" element={<Navigate to="/settings?tab=staff" replace />} />
          <Route path="/inventory" element={hallPage(HALL_PAGE_KEYS.INVENTORY, <Inventory />)} />
          <Route path="/inventory/:itemId" element={hallPage(HALL_PAGE_KEYS.INVENTORY, <InventoryDetail />)} />
          <Route path="/decoration-packages" element={hallPage(HALL_PAGE_KEYS.DECORATIONS, <DecorationPackages />)} />
          <Route path="/decoration-packages/:packageId" element={hallPage(HALL_PAGE_KEYS.DECORATIONS, <DecorationPackageDetail />)} />
          <Route path="/reports" element={hallPage(HALL_PAGE_KEYS.REPORTS, <ManagerRoute><Reports /></ManagerRoute>)} />
          <Route path="/notifications" element={hallPage(HALL_PAGE_KEYS.NOTIFICATIONS, <ManagerRoute><Notifications /></ManagerRoute>)} />
          <Route path="/profile" element={hallPage(HALL_PAGE_KEYS.PROFILE, <Profile />)} />
          <Route path="/settings" element={hallPage(HALL_PAGE_KEYS.SETTINGS, <ManagerRoute><Settings /></ManagerRoute>)} />
        </Route>

        {/* Guest House app - same shell UI as Marriage Hall */}
        <Route
          element={
            <ProtectedRoute>
              <GuestHouseRoute>
                <DashboardLayout />
              </GuestHouseRoute>
            </ProtectedRoute>
          }
        >
          <Route path="/gh/dashboard" element={ghPage(GH_PAGE_KEYS.DASHBOARD, <StaffBlockedRoute><GuestHouseOverview /></StaffBlockedRoute>)} />
          <Route path="/gh/book" element={ghPage(GH_PAGE_KEYS.BOOK, <BookFutureStayPage />)} />
          <Route path="/gh/stays/new" element={<Navigate to="/gh/book" replace />} />
          <Route path="/gh/stays/:stayId/edit" element={ghPage(GH_PAGE_KEYS.STAYS, <StayFormPage />)} />
          <Route path="/gh/stays" element={ghPage(GH_PAGE_KEYS.STAYS, <GuestHouseStays />)} />
          <Route path="/gh/stays/:stayId" element={ghPage(GH_PAGE_KEYS.STAYS, <StayDetail />)} />
          <Route path="/gh/calendar" element={ghPage(GH_PAGE_KEYS.CALENDAR, <StayCalendar />)} />
          <Route path="/gh/rooms/new" element={ghPage(GH_PAGE_KEYS.ROOMS, <RoomFormPage />)} />
          <Route path="/gh/rooms/:roomId/edit" element={ghPage(GH_PAGE_KEYS.ROOMS, <RoomFormPage />)} />
          <Route path="/gh/rooms" element={<Navigate to="/gh/settings?tab=rooms" replace />} />
          <Route path="/gh/services" element={<Navigate to="/gh/settings?tab=services" replace />} />
          <Route path="/gh/customers" element={ghPage(GH_PAGE_KEYS.CUSTOMERS, <GhCustomers />)} />
          <Route path="/gh/customers/:customerId" element={ghPage(GH_PAGE_KEYS.CUSTOMERS, <GhCustomers />)} />
          <Route path="/gh/records" element={<Navigate to="/gh/settings?tab=records" replace />} />
          <Route path="/gh/payments/new" element={ghPage(GH_PAGE_KEYS.PAYMENTS, <ManagerRoute><PaymentFormPage /></ManagerRoute>)} />
          <Route path="/gh/payments/:paymentId/edit" element={ghPage(GH_PAGE_KEYS.PAYMENTS, <ManagerRoute><PaymentFormPage /></ManagerRoute>)} />
          <Route path="/gh/payments" element={ghPage(GH_PAGE_KEYS.PAYMENTS, <ManagerRoute><GuestHousePayments /></ManagerRoute>)} />
          <Route path="/gh/journal-entries" element={ghPage(GH_PAGE_KEYS.DASHBOARD, <ManagerRoute><JournalEntries /></ManagerRoute>)} />
          <Route path="/gh/trial-balance" element={ghPage(GH_PAGE_KEYS.DASHBOARD, <ManagerRoute><TrialBalance /></ManagerRoute>)} />
          <Route path="/gh/expenses/new" element={ghPage(GH_PAGE_KEYS.EXPENSES, <ManagerRoute><ExpenseFormPage /></ManagerRoute>)} />
          <Route path="/gh/expenses/:expenseId/edit" element={ghPage(GH_PAGE_KEYS.EXPENSES, <ManagerRoute><ExpenseFormPage /></ManagerRoute>)} />
          <Route path="/gh/expenses/:expenseId" element={ghPage(GH_PAGE_KEYS.EXPENSES, <ManagerRoute><GhExpenseDetail /></ManagerRoute>)} />
          <Route path="/gh/expenses" element={ghPage(GH_PAGE_KEYS.EXPENSES, <ManagerRoute><GuestHouseExpenses /></ManagerRoute>)} />
          <Route path="/gh/reports" element={ghPage(GH_PAGE_KEYS.REPORTS, <ManagerRoute><GuestHouseReports /></ManagerRoute>)} />
          <Route path="/gh/notifications" element={ghPage(GH_PAGE_KEYS.NOTIFICATIONS, <ManagerRoute><Notifications /></ManagerRoute>)} />
          <Route path="/gh/staff" element={<Navigate to="/gh/settings?tab=staff" replace />} />
          <Route path="/gh/profile" element={ghPage(GH_PAGE_KEYS.PROFILE, <Profile />)} />
          <Route path="/gh/settings" element={ghPage(GH_PAGE_KEYS.SETTINGS, <ManagerRoute><Settings /></ManagerRoute>)} />
        </Route>

        <Route
          path="/gh/print/stay/:stayId"
          element={
            <ProtectedRoute>
              <GuestHouseRoute>
                <GhPrintStay />
              </GuestHouseRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/gh/print/payment/:paymentId"
          element={
            <ProtectedRoute>
              <GuestHouseRoute>
                <GhPrintPayment />
              </GuestHouseRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/gh/print/expense/:expenseId"
          element={
            <ProtectedRoute>
              <GuestHouseRoute>
                <GhPrintExpense />
              </GuestHouseRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/gh/print/:stayId"
          element={
            <ProtectedRoute>
              <GuestHouseRoute>
                <GhPrintStay />
              </GuestHouseRoute>
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}

export default App;
