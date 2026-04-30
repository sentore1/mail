"use client";

import { useState, useEffect } from "react";
import { Plus, Mail, Trash2, CheckCircle, XCircle, AlertCircle, Settings } from "lucide-react";
import { addSMTPAccountAction, getSMTPAccountsAction } from "@/app/actions";
import { toast } from "sonner";

interface SMTPManagerProps {
  userId: string;
}

const SMTP_PROVIDERS = [
  { name: "Gmail", host: "smtp.gmail.com", port: 587, limit: 100 },
  { name: "Outlook", host: "smtp-mail.outlook.com", port: 587, limit: 100 },
  { name: "SendGrid", host: "smtp.sendgrid.net", port: 587, limit: 100 },
  { name: "Mailgun", host: "smtp.mailgun.org", port: 587, limit: 100 },
  { name: "SMTP2GO", host: "mail.smtp2go.com", port: 2525, limit: 100 },
  { name: "Custom", host: "", port: 587, limit: 100 },
];

export default function SMTPManager({ userId }: SMTPManagerProps) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [capacity, setCapacity] = useState({ total: 0, used: 0, remaining: 0 });
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    provider: "Gmail",
    email: "",
    host: "smtp.gmail.com",
    port: 587,
    user: "",
    password: "",
    daily_limit: 100,
  });

  useEffect(() => {
    loadAccounts();
  }, [userId]);

  const loadAccounts = async () => {
    const result = await getSMTPAccountsAction(userId);
    if (result.success) {
      setAccounts(result.accounts);
      setCapacity(result.capacity);
    }
  };

  const handleProviderChange = (provider: string) => {
    const selected = SMTP_PROVIDERS.find(p => p.name === provider);
    if (selected) {
      setFormData({
        ...formData,
        provider,
        host: selected.host,
        port: selected.port,
        daily_limit: selected.limit,
      });
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      console.log('Adding SMTP account:', {
        email: formData.email,
        host: formData.host,
        port: formData.port,
        provider: formData.provider,
        daily_limit: formData.daily_limit,
      });

      const result = await addSMTPAccountAction(userId, {
        email: formData.email,
        host: formData.host,
        port: formData.port,
        user: formData.user || formData.email,
        password: formData.password,
        provider: formData.provider,
        daily_limit: formData.daily_limit,
      });

      console.log('Add SMTP result:', result);

      if (result.success) {
        toast.success("SMTP account added successfully");
        setShowAddForm(false);
        setFormData({
          provider: "Gmail",
          email: "",
          host: "smtp.gmail.com",
          port: 587,
          user: "",
          password: "",
          daily_limit: 100,
        });
        loadAccounts();
      } else {
        console.error('Failed to add SMTP account:', result.error);
        toast.error(result.error || "Failed to add SMTP account");
      }
    } catch (error) {
      console.error('Exception adding SMTP account:', error);
      toast.error("An error occurred: " + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return <CheckCircle size={16} className="text-green-500" />;
      case "error":
        return <XCircle size={16} className="text-red-500" />;
      case "paused":
        return <AlertCircle size={16} className="text-yellow-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6 h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">SMTP Accounts</h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage your email sending accounts
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          Add Account
        </button>
      </div>

      {/* Capacity Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
          <div className="flex items-center gap-2 mb-2">
            <Mail size={20} className="text-blue-600" />
            <span className="text-sm font-medium text-gray-700">Total Capacity</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{capacity.total.toLocaleString()}</p>
          <p className="text-xs text-gray-600 mt-1">emails per day</p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border border-green-200">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle size={20} className="text-green-600" />
            <span className="text-sm font-medium text-gray-700">Remaining</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{capacity.remaining.toLocaleString()}</p>
          <p className="text-xs text-gray-600 mt-1">emails available today</p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border border-purple-200">
          <div className="flex items-center gap-2 mb-2">
            <Settings size={20} className="text-purple-600" />
            <span className="text-sm font-medium text-gray-700">Active Accounts</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{accounts.filter(a => a.status === 'active').length}</p>
          <p className="text-xs text-gray-600 mt-1">of {accounts.length} total</p>
        </div>
      </div>

      {/* Add Account Form */}
      {showAddForm && (
        <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Add New SMTP Account</h3>
          <form onSubmit={handleAddAccount} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Provider
                </label>
                <select
                  value={formData.provider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {SMTP_PROVIDERS.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SMTP Host
                </label>
                <input
                  type="text"
                  value={formData.host}
                  onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Port
                </label>
                <input
                  type="number"
                  value={formData.port}
                  onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Username (optional)
                </label>
                <input
                  type="text"
                  value={formData.user}
                  onChange={(e) => setFormData({ ...formData, user: e.target.value })}
                  placeholder="Leave empty to use email"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password / App Password
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Daily Limit
                </label>
                <input
                  type="number"
                  value={formData.daily_limit}
                  onChange={(e) => setFormData({ ...formData, daily_limit: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? "Adding..." : "Add Account"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Accounts List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                Provider
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                Usage Today
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                Daily Limit
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {accounts.map((account) => (
              <tr key={account.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(account.status)}
                    <span className="text-sm capitalize">{account.status}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">{account.email}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{account.provider}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-[100px]">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{
                          width: `${(account.sent_today / account.daily_limit) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm text-gray-600">{account.sent_today}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{account.daily_limit}</td>
                <td className="px-4 py-3">
                  <button className="text-red-600 hover:text-red-700">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {accounts.length === 0 && (
          <div className="text-center py-12">
            <Mail size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-600">No SMTP accounts configured</p>
            <p className="text-sm text-gray-500 mt-1">Add your first account to start sending emails</p>
          </div>
        )}
      </div>
    </div>
  );
}
