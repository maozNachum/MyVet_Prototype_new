import { Outlet } from "react-router";
import { Navbar } from "../components/Navbar";
import { Footer } from "../components/Footer";
import { CommandCenter } from "../components/CommandCenter";

export function Layout() {
  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gray-50/80 flex flex-col"
      style={{ fontFamily: "'Heebo', sans-serif" }}
    >
      <Navbar />
      <CommandCenter />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}