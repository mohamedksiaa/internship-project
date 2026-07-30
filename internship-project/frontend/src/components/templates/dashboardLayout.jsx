export default function DashboardLayout({ timer, entryList }) {
  return (
    <div className="max-w-5xl mx-auto p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="md:col-span-1">{timer}</div>
      <div className="md:col-span-2">{entryList}</div>
    </div>
  );
}