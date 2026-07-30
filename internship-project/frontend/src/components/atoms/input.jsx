export default function Input({ value, onChange, placeholder, type = 'text' }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="border rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  );
}