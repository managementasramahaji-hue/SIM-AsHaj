import { Building2, LayoutDashboard, Users, Menu, X } from "lucide-react";
import { useState } from "react";

export function Sidebar({ activeTab, setActiveTab }: { activeTab: string; setActiveTab: (t: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: "buildings", label: "Gedung & Kamar", icon: <Building2 className="w-5 h-5" /> },
    { id: "tenants", label: "Penyewa", icon: <Users className="w-5 h-5" /> },
  ];

  return (
    <>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-md shadow-md"
      >
        {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      <div className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 text-slate-300 transform ${isOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0 transition-transform duration-200 ease-in-out`}>
        <div className="p-6">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Building2 className="w-6 h-6 text-indigo-400" />
            LodgingPro
          </h1>
          <p className="text-xs mt-1 text-slate-500">Multi-Gedung Management</p>
        </div>

        <nav className="px-4 mt-6 space-y-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                activeTab === tab.id 
                  ? "bg-indigo-600 text-white" 
                  : "hover:bg-slate-800 hover:text-white"
              }`}
            >
              {tab.icon}
              <span className="font-medium">{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </>
  );
}
