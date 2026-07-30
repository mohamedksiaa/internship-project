import Input from '../atoms/input';

export default function NoteField({ value, onChange }) {
  return (
    <div>
      <label className="block text-sm text-gray-600 mb-1">Description</label>
      <Input value={value} onChange={onChange} placeholder="Sur quoi travailles-tu ?" />
    </div>
  );
}