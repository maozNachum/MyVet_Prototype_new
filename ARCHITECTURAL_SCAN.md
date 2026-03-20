# 🏥 MyVet Prototype: Architectural Scan Report

## 1. Directory Structure (`src/`)
The project follows a feature-based modular structure within the `app` directory, separating concerns between UI, business logic, and data management.

```text
src/
├── app/
│   ├── components/          # Feature-specific modules & complex UI
│   │   ├── figma/           # Design-compliant assets (e.g., ImageWithFallback)
│   │   ├── reports/         # Analytical dashboard widgets (Revenue, EpiRadar, etc.)
│   │   ├── schedule/        # Calendar sub-views (Daily, Weekly, Monthly)
│   │   ├── shared/          # Generic UI primitives (Modals, Icons, Notifications)
│   │   └── ui/              # Shadcn/UI base components (Button, Card, Input, etc.)
│   ├── data/                # Context API Stores & Static Mock Data
│   ├── hooks/               # Custom React hooks for logic reuse
│   ├── pages/               # Top-level route components (Dashboard, Patients, etc.)
│   ├── utils/               # Pure helper functions (String manipulation, etc.)
│   ├── App.tsx              # Provider wrapper & Root component
│   └── routes.tsx           # React Router configuration
├── main.tsx                 # DOM Mounting & Entry point
└── styles/                  # Global Tailwind & RTL/Theme configurations
```

---

## 2. Routing Map
The application uses `react-router` with a centralized configuration in `src/app/routes.tsx`.

| Path | Component | Description |
| :--- | :--- | :--- |
| `/login` | `Login` | Staff authentication portal. |
| `/portal` | `ClientPortal` | Public-facing owner view for bookings and medical history. |
| `/` | `Layout` (Parent) | Shared shell with Sidebar, Navbar, and Breadcrumbs. |
| `├─ (index)` | `Dashboard` | KPI cards, Walk-in management, and "Today's Clinic" table. |
| `├─ appointments`| `AppointmentSchedule`| Interactive calendar (Daily/Weekly/Monthly) with filters. |
| `├─ appointments/new`| `NewAppointment`| Wizard for creating new appointments/registrations. |
| `├─ patients` | `Patients` | Full searchable database of owners and pets. |
| `├─ inventory` | `Inventory` | Stock levels, price tracking, and expiry alerts. |
| `└─ reports` | `Reports` | High-level analytics (Staff utilization, Revenue leakage). |

---

## 3. Global State & Data Flow
The project uses **React Context API** for state management, located in `src/app/data/`. These stores act as a localized database during development.

### Main Stores & Interfaces:
*   **`MedicalStore.tsx`**: Manages `MedicalVisit[]`.
    *   *Types*: `MedicalVisit` (ID, patientId, vet, vitals, diagnoses, treatments, prescriptions).
    *   *Role*: Tracks clinical history across the app.
*   **`AppointmentStore.tsx`**: Manages `CalendarAppointment[]` and `AppNotification[]`.
    *   *Types*: `CalendarAppointment` (Time, pet, owner, department, vet, status).
    *   *Role*: Single source of truth for the Schedule and Notification Center.
*   **`LabStore.tsx`**: Manages `LabOrder[]`.
    *   *Types*: `LabOrder` (Test name, category, status, results, critical flags).
    *   *Role*: Coordinates lab workflows between the clinical view and lab panel.

---

## 4. Refactored Shared Utilities
These files ensure consistency across multiple features and simplify future changes:

*   **`useSearchFilter.ts`**: A generic hook used in `Patients`, `Inventory`, and `Dashboard`. It handles filtering logic and integrates with `normalizeSearchString`.
*   **`useFormData.ts`**: Standardizes form state management, replacing repetitive `useState` blocks in `NewAppointment` and `Dashboard`.
*   **`categoryConfig.ts`**: The central mapping for **Colors, Icons, and Labels**. If a visit type or inventory category needs a color change, it is updated here once.
*   **`string.ts`**: Provides `normalizeSearchString`, which strips Hebrew punctuation (e.g., `ג'וני` vs `גוני`) to make searches resilient.

---

## 5. Core Complex Components
### `TreatmentModal.tsx`
*   **Internal State**: Uses a large `TreatmentData` object managed through an 8-step wizard.
*   **Logic**: Handles vital sign validation, dynamic list management for diagnoses/treatments, and integrates with `PaymentModal` and `AnesthesiaConsentModal`.
*   **Output**: On completion, it dispatches an `addVisit` call to `MedicalStore`.

### `AppointmentsTable.tsx`
*   **Props**: Displays current appointments based on filtered criteria.
*   **Logic**: Contains the "Start Visit" trigger that launches the clinical workflow. It also handles the "Check-in" status updates.

### `Schedule/DailyView.tsx` & `WeeklyView.tsx`
*   **Logic**: Calculates time-slot positions for appointments. They consume `AppointmentStore` and use `calendar-constants.ts` for Hebrew date calculations and department-specific color themes.

---

## 6. Missing Pieces & Backend Readiness
The prototype is architected to be "Plug-and-Play" for a real backend:

1.  **API Integration**: All stores currently initialize with `useState(initialMockData)`. These should be replaced with `useEffect` fetching and `react-query` or similar.
2.  **Authentication**: `staffAuth.ts` currently performs mock checks. A real Auth provider (Firebase/Auth0/Custom JWT) is needed.
3.  **Persistence**: Data is lost on page refresh. Implementing a sync to a DB (PostgreSQL/Supabase) is the next logical step.
4.  **Real-time**: The Notification system is static. It is prepared for WebSockets (SignalR/Socket.io) to push updates from the Owner Portal to the Staff Dashboard.
5.  **Binary Assets**: `ImageWithFallback` and Medical Reports expect local paths; these need to be mapped to a Cloud Storage bucket (S3/Azure Blob).
