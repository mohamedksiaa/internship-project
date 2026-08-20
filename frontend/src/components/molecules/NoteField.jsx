import { useTranslation } from 'react-i18next';
import Input from '../atoms/input.jsx';

export default function NoteField({ value, onChange }) {
  const { t } = useTranslation();
  return (
    <div>
      <label className="block text-sm text-gray-600 mb-1">{t('timeentry.col_task')}</label>
      <Input value={value} onChange={onChange} placeholder={t('timeentry.no_description')} />
    </div>
  );
}