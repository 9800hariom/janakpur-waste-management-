"use client";

import { useState, useEffect } from "react";
import { User, Mail, Phone, MapPin, Save, Building, Loader } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "next-auth/react";
import { getUserByEmail, updateUserProfile } from "@/utils/db/actions";
import { toast } from "react-hot-toast";

type UserSettings = {
  name: string;
  email: string;
  phone: string;
  address: string;
  wardNumber: string;
};

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(true);
  const [userDb, setUserDb] = useState<any>(null);
  const [settings, setSettings] = useState<UserSettings>({
    name: "",
    email: "",
    phone: "",
    address: "",
    wardNumber: "",
  });

  useEffect(() => {
    async function loadUserProfile() {
      if (status === "authenticated" && session?.user?.email) {
        setLoading(true);
        try {
          const user = await getUserByEmail(session.user.email);
          if (user) {
            setUserDb(user);
            setSettings({
              name: user.name || "",
              email: user.email || "",
              phone: user.phone || "",
              address: user.address || "",
              wardNumber: user.wardNumber || "",
            });
          }
        } catch (error) {
          console.error("Error loading settings:", error);
          toast.error("Failed to load profile settings.");
        } finally {
          setLoading(false);
        }
      } else if (status === "unauthenticated") {
        toast.error("Please log in to edit profile settings.");
        setLoading(false);
      }
    }
    if (status !== "loading") {
      loadUserProfile();
    }
  }, [status, session]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setSettings((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userDb) {
      toast.error("User session not loaded.");
      return;
    }

    try {
      const res = await updateUserProfile(
        userDb.id,
        settings.name,
        settings.phone,
        settings.address,
        settings.wardNumber
      );
      if (res) {
        toast.success("Profile settings updated successfully!");
      } else {
        toast.error("Failed to update settings.");
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Error saving settings.");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader className="animate-spin h-8 w-8 text-green-500" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-semibold mb-6 text-gray-800">Account Settings</h1>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
          <div className="relative">
            <input
              type="text"
              id="name"
              name="name"
              value={settings.name}
              onChange={handleInputChange}
              className="pl-10 w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
              required
            />
            <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
          </div>
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
          <div className="relative">
            <input
              type="email"
              id="email"
              name="email"
              value={settings.email}
              disabled
              className="pl-10 w-full px-4 py-2 border border-gray-200 rounded-md bg-gray-50 text-gray-500 cursor-not-allowed"
            />
            <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
          </div>
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
          <div className="relative">
            <input
              type="tel"
              id="phone"
              name="phone"
              value={settings.phone}
              onChange={handleInputChange}
              className="pl-10 w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
            />
            <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
          </div>
        </div>

        <div>
          <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <div className="relative">
            <input
              type="text"
              id="address"
              name="address"
              value={settings.address}
              onChange={handleInputChange}
              className="pl-10 w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
              required
            />
            <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
          </div>
        </div>

        <div>
          <label htmlFor="wardNumber" className="block text-sm font-medium text-gray-700 mb-1">Ward Number</label>
          <div className="relative">
            <input
              type="text"
              id="wardNumber"
              name="wardNumber"
              value={settings.wardNumber}
              onChange={handleInputChange}
              className="pl-10 w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
              required
            />
            <Building className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
          </div>
        </div>

        <Button type="submit" className="w-full bg-green-500 hover:bg-green-600 text-white py-6 rounded-xl font-bold shadow-lg">
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </Button>
      </form>
    </div>
  );
}