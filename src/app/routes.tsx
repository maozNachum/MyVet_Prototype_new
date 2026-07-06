import { createBrowserRouter, Navigate } from "react-router";
import { Layout } from "./pages/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { AppointmentSchedule } from "./pages/AppointmentSchedule";
import { NewAppointment } from "./pages/NewAppointment";
import { Patients } from "./pages/Patients";
import { Clients } from "./pages/Clients";
import { Inventory } from "./pages/Inventory";
import { ClientPortal } from "./pages/ClientPortal";
import { Reports } from "./pages/Reports";
import { DigitalCare } from "./pages/DigitalCare";
import { Hospitalizations } from "./pages/Hospitalizations";
import { LabOrders } from "./pages/LabOrders";
import { PriceList } from "./pages/PriceList";

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: Login,
  },
  {
    path: "/portal",
    Component: ClientPortal,
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
      { path: "reports", Component: Reports },
      { path: "digital-care", Component: DigitalCare },
      { path: "hospitalizations", Component: Hospitalizations },
      { path: "lab-orders", Component: LabOrders },
      { path: "price-list", Component: PriceList },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);