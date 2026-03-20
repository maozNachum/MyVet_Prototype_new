import { RouterProvider } from "react-router";
import { router } from "./routes";
import { MedicalStoreProvider } from "./data/MedicalStore";
import { AppointmentStoreProvider } from "./data/AppointmentStore";
import { LabStoreProvider } from "./data/LabStore";

export default function App() {
  return (
    <MedicalStoreProvider>
      <AppointmentStoreProvider>
        <LabStoreProvider>
          <RouterProvider router={router} />
        </LabStoreProvider>
      </AppointmentStoreProvider>
    </MedicalStoreProvider>
  );
}