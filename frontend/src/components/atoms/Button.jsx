export default function Button({ children, onClick, variant = 'primary', disabled = false }) {
  const variants = {
    primary: 'tw-bg-blue-600 hover:tw-bg-blue-700 tw-text-white',
    danger: 'tw-bg-red-600 hover:tw-bg-red-700 tw-text-white',
    secondary: 'tw-bg-gray-200 hover:tw-bg-gray-300 tw-text-gray-800',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`tw-px-4 tw-py-2 tw-rounded tw-font-medium tw-transition-colors disabled:tw-opacity-50 ${variants[variant]}`}
    >
      {children}
    </button>
  );
}
