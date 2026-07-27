import { lazy } from "react";
import { createBrowserRouter, Navigate } from "react-router";
import { canAccessReportsPage } from "./data/staffAuth";
import { AiAssistantShell } from "./components/ai/AiAssistantShell";

const Layout = lazy(() => import("./pages/Layout").then((module) => ({ default: module.Layout })));
const Login = lazy(() => import("./pages/Login").then((module) => ({ default: module.Login })));
const Dashboard = lazy(() => import("./pages/Dashboard").then((module) => ({ default: module.Dashboard })));
const AppointmentSchedule = lazy(() => import("./pages/AppointmentSchedule").then((module) => ({ default: module.AppointmentSchedule })));
const NewAppointment = lazy(() => import("./pages/NewAppointment").then((module) => ({ default: module.NewAppointment })));
const Patients = lazy(() => import("./pages/Patients").then((module) => ({ default: module.Patients })));
const Clients = lazy(() => import("./pages/Clients").then((module) => ({ default: module.Clients })));
const Inventory = lazy(() => import("./pages/Inventory").then((module) => ({ default: module.Inventory })));
const ClientPortal = lazy(() => import("./pages/ClientPortal").then((module) => ({ default: module.ClientPortal })));
const Reports = lazy(() => import("./pages/Reports").then((module) => ({ default: module.Reports })));
const DigitalCare = lazy(() => import("./pages/DigitalCare").then((module) => ({ default: module.DigitalCare })));
const Hospitalizations = lazy(() => import("./pages/Hospitalizations").then((module) => ({ default: module.Hospitalizations })));
const LabOrders = lazy(() => import("./pages/LabOrders").then((module) => ({ default: module.LabOrders })));
const PriceList = lazy(() => import("./pages/PriceList").then((module) => ({ default: module.PriceList })));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy").then((module) => ({ default: module.PrivacyPolicy })));
const AccessibilityStatement = lazy(() => import("./pages/AccessibilityStatement").then((module) => ({ default: module.AccessibilityStatement })));

function ReportsRoute() {
  return canAccessReportsPage() ? <Reports /> : <Navigate to="/" replace />;
}

function ClientPortalRoute() {
  return (
    <AiAssistantShell area="portal">
      <ClientPortal />
    </AiAssistantShell>
  );
}

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: Login,
  },
  {
    path: "/portal",
    Component: ClientPortalRoute,
  },
  {
    path: "/owner-preview",
    Component: ClientPortalRoute,
  },
  {
    path: "/privacy",
    Component: PrivacyPolicy,
  },
  {
    path: "/accessibility",
    Component: AccessibilityStatement,
  },
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: Dashboard },
      { path: "appointments", Component: AppointmentSchedule },
      { path: "appointments/new", Component: NewAppointment },
      { path: "clients", Component: Clients },
      { path: "patients", Component: Patients },
      { path: "inventory", Component: Inventory },
      { path: "reports", Component: ReportsRoute },
      { path: "digital-care", Component: DigitalCare },
      { path: "hospitalizations", Component: Hospitalizations },
      { path: "lab-orders", Component: LabOrders },
      { path: "price-list", Component: PriceList },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
