'use client';

import {
  ArrowLeft,
  BrainCog,
  Database,
  ExternalLink,
  Search,
  Sliders,
  ToggleRight,
  BarChart3,
} from 'lucide-react';
import Preferences from '@/components/Settings/Sections/Preferences';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import Loader from '@/components/ui/Loader';
import { cn } from '@/lib/utils';
import Models from '@/components/Settings/Sections/Models/Section';
import SearchSection from '@/components/Settings/Sections/Search';
import Select from '@/components/ui/Select';
import Personalization from '@/components/Settings/Sections/Personalization';
import EmbeddingsSection from '@/components/Settings/Sections/Embeddings';
import AnalyticsSection from '@/components/Settings/Sections/Analytics';
import Link from 'next/link';

const sections = [
  {
    key: 'preferences',
    name: 'Preferences',
    description: 'Customize your application preferences.',
    icon: Sliders,
    component: Preferences,
    dataAdd: 'preferences',
  },
  {
    key: 'personalization',
    name: 'Personalization',
    description: 'Customize the behavior and tone of the model.',
    icon: ToggleRight,
    component: Personalization,
    dataAdd: 'personalization',
  },
  {
    key: 'models',
    name: 'Models',
    description: 'Connect to AI services and manage connections.',
    icon: BrainCog,
    component: Models,
    dataAdd: 'modelProviders',
  },
  {
    key: 'search',
    name: 'Search',
    description: 'Manage search settings.',
    icon: Search,
    component: SearchSection,
    dataAdd: 'search',
  },
  {
    key: 'embeddings',
    name: 'Embeddings',
    description: 'Manage embeddings for semantic search and analytics.',
    icon: Database,
    component: EmbeddingsSection,
    dataAdd: 'embeddings',
  },
  {
    key: 'analytics',
    name: 'Analytics',
    description: 'Configure Curiosity Map clustering and visualization.',
    icon: BarChart3,
    component: AnalyticsSection,
    dataAdd: 'analytics',
  },
];

export default function SettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [config, setConfig] = useState<any>(null);
  const [activeSection, setActiveSection] = useState<string>(sections[0].key);
  const [selectedSection, setSelectedSection] = useState(sections[0]);

  useEffect(() => {
    setSelectedSection(sections.find((s) => s.key === activeSection)!);
  }, [activeSection]);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const [configRes, settingsRes] = await Promise.all([
          fetch('/api/config', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          }),
          fetch('/api/settings', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          }),
        ]);

        const configData = await configRes.json();
        const settingsData = await settingsRes.json();

        const merged = {
          ...configData,
          values: {
            ...configData.values,
            preferences: {
              ...configData.values.preferences,
              ...(settingsData.data
                ? {
                    theme: settingsData.data.theme,
                    measureUnit: settingsData.data.measureUnit,
                    autoMediaSearch: settingsData.data.autoMediaSearch,
                    showWeatherWidget: settingsData.data.showWeatherWidget,
                    showNewsWidget: settingsData.data.showNewsWidget,
                  }
                : {}),
            },
            personalization: {
              ...configData.values.personalization,
              ...(settingsData.data
                ? {
                    userName: settingsData.data.userName,
                    location: settingsData.data.location,
                    systemInstructions: settingsData.data.systemInstructions,
                    aboutMe: settingsData.data.aboutMe,
                    enableMemories: settingsData.data.enableMemories,
                    enableSuggestions: settingsData.data.enableSuggestions,
                  }
                : {}),
            },
            embeddings: {},
            analytics: {
              ...(settingsData.data
                ? {
                    similarityThreshold: settingsData.data.similarityThreshold,
                    knnNeighbors: settingsData.data.knnNeighbors,
                    analyticsLlmProviderId: settingsData.data.analyticsLlmProviderId,
                    analyticsLlmKey: settingsData.data.analyticsLlmKey,
                  }
                : {}),
            },
          },
        };

        setConfig(merged);
      } catch (error) {
        console.error('Error fetching config:', error);
        toast.error('Failed to load configuration.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchConfig();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <Loader />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-light-200 dark:border-dark-200 bg-light-primary dark:bg-dark-primary">
      <div className="flex flex-1 overflow-hidden">
        <div className="hidden lg:flex flex-col justify-between w-[240px] border-r border-white-200 dark:border-dark-200 h-full px-3 pt-3 overflow-y-auto">
          <div className="flex flex-col">
            <Link
              href="/"
              className="group flex flex-row items-center hover:bg-light-200 hover:dark:bg-dark-200 p-2 rounded-lg"
            >
              <ArrowLeft
                size={18}
                className="text-black/50 dark:text-white/50 group-hover:text-black/70 group-hover:dark:text-white/70"
              />
              <p className="text-black/50 dark:text-white/50 group-hover:text-black/70 group-hover:dark:text-white/70 text-[14px]">
                Back
              </p>
            </Link>

            <div className="flex flex-col items-start space-y-1 mt-8">
              {sections.map((section) => (
                <button
                  key={section.dataAdd}
                  className={cn(
                    'flex flex-row items-center space-x-2 px-2 py-1.5 rounded-lg w-full text-sm hover:bg-light-200 hover:dark:bg-dark-200 transition duration-200 active:scale-95',
                    activeSection === section.key
                      ? 'bg-light-200 dark:bg-dark-200 text-black/90 dark:text-white/90'
                      : 'text-black/70 dark:text-white/70',
                  )}
                  onClick={() => setActiveSection(section.key)}
                >
                  <section.icon size={17} />
                  <p>{section.name}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col space-y-1 py-[18px] px-2">
            <p className="text-xs text-black/70 dark:text-white/70">
              Version: {process.env.NEXT_PUBLIC_VERSION}
            </p>
            <a
              href="https://github.com/kspviswa/uttaram"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-black/70 dark:text-white/70 flex flex-row space-x-1 items-center transition duration-200 hover:text-black/90 hover:dark:text-white/90"
            >
              <span>GitHub</span>
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
        <div className="w-full flex flex-col overflow-hidden">
          <div className="flex flex-row lg:hidden w-full items-center justify-between px-4 py-3 flex-shrink-0 border-b border-light-200/60 dark:border-dark-200/60">
            <Link
              href="/"
              className="group flex flex-row items-center gap-1.5 hover:bg-light-200 hover:dark:bg-dark-200 rounded-lg px-2 py-1.5"
            >
              <ArrowLeft
                size={18}
                className="text-black/50 dark:text-white/50 group-hover:text-black/70 group-hover:dark:text-white/70"
              />
              <span className="text-sm text-black/50 dark:text-white/50 group-hover:text-black/70 group-hover:dark:text-white/70">
                Close
              </span>
            </Link>
            <Select
              options={sections.map((section) => ({
                value: section.key,
                key: section.key,
                label: section.name,
              }))}
              value={activeSection}
              onChange={(e) => {
                setActiveSection(e.target.value);
              }}
              className="!text-xs lg:!text-sm"
            />
          </div>
          {selectedSection.component && (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="border-b border-light-200/60 px-6 pb-6 lg:pt-6 dark:border-dark-200/60 flex-shrink-0">
                <div className="flex flex-col">
                  <h4 className="font-medium text-black dark:text-white text-sm lg:text-sm">
                    {selectedSection.name}
                  </h4>
                  <p className="text-[11px] lg:text-xs text-black/50 dark:text-white/50">
                    {selectedSection.description}
                  </p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                <selectedSection.component
                  fields={config.fields[selectedSection.dataAdd]}
                  values={config.values[selectedSection.dataAdd]}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
