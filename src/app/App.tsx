import { RouterProvider } from "react-router";
import { router } from "./routes";
import { MedicalStoreProvider } from "./data/MedicalStore";
import { AppointmentStoreProvider } from "./data/AppointmentStore";
import { LabStoreProvider } from "./data/LabStore";
import { useState, useEffect } from 'react'
import { supabase } from '../services/supabaseClient'

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
