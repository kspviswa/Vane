'use client';

import { useState, useEffect } from 'react';
import SettingsField from '@/components/Settings/SettingsField';
import ModelSelect from '@/components/Settings/Sections/Models/ModelSelect';
import { UIConfigField, ConfigModelProvider } from '@/lib/config/types';

export default function AnalyticsSection({
  fields,
  values,
}: {
  fields: UIConfigField[];
  values: Record<string, any>;
}) {
  const [providers, setProviders] = useState<ConfigModelProvider[]>([]);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((data) => {
        const modelProviders = data.values?.modelProviders || [];
        setProviders(modelProviders.filter((p: ConfigModelProvider) =>
          p.chatModels.some((m) => m.key !== 'error'),
        ));
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
      <div className="space-y-1">
        <p className="text-xs text-black/50 dark:text-white/50">
          Adjust how chats are clustered and connected in the Curiosity Map.
          Changes take effect on next page load.
        </p>
      </div>

      <div className="space-y-4">
        <h4 className="text-sm font-medium text-black/80 dark:text-white/80">
          Clustering Settings
        </h4>
        {fields.map((field) => (
          <SettingsField
            key={field.key}
            field={field}
            value={values[field.key] ?? field.default}
            dataAdd="analytics"
          />
        ))}
      </div>

      <div className="border-t border-light-200 dark:border-dark-200 pt-4">
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-medium text-black/80 dark:text-white/80">
              AI Label Generation
            </h4>
            <p className="text-[11px] text-black/50 dark:text-white/50 mt-1">
              Select a model to generate meaningful cluster labels. Falls back to keyword extraction if not configured.
            </p>
          </div>
          <ModelSelect
            providers={providers}
            type="analytics"
          />
        </div>
      </div>
    </div>
  );
}
