import { createBrowserRouter, Navigate } from "react-router";
import { Layout } from "./pages/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { AppointmentSchedule } from "./pages/AppointmentSchedule";
import { NewAppointment } from "./pages/NewAppointment";
import { Patients } from "./pages/Patients";
import { Inventory } from "./pages/Inventory";
import { ClientPortal } from "./pages/ClientPortal";
import { Reports } from "./pages/Reports";

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
      { path: "patients", Component: Patients },
      { path: "inventory", Component: Inventory },
      { path: "reports", Component: Reports },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);