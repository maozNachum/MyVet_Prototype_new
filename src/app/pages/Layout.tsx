import { Outlet } from "react-router";
import { Navbar } from "../components/Navbar";
import { ChatWidget } from "../components/ChatWidget";
import { Footer } from "../components/Footer";

export function Layout() {
  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gray-50/80 flex flex-col"
      style={{ fontFamily: "'Heebo', sans-serif" }}
    >
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <ChatWidget mode="staff" />
    </div>
  );
}