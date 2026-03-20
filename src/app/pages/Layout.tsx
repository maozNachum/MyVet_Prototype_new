import { Outlet } from "react-router";
import { Navbar } from "../components/Navbar";
import { ChatWidget } from "../components/ChatWidget";

export function Layout() {
  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gray-50/80"
      style={{ fontFamily: "'Heebo', sans-serif" }}
    >
      <Navbar />
      <Outlet />
      <ChatWidget mode="staff" />
    </div>
  );
}