import { ChevronDown, Sliders, Star, Zap, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverButton,
  PopoverPanel,
  Dialog,
  DialogPanel,
  Transition,
} from '@headlessui/react';
import { Fragment, useState } from 'react';
import { useChat } from '@/lib/hooks/useChat';
import { AnimatePresence, motion } from 'motion/react';

const OptimizationModes = [
  {
    key: 'speed',
    title: 'Speed',
    description: 'Prioritize speed and get the quickest possible answer.',
    icon: <Zap size={16} className="text-[#FF9800]" />,
  },
  {
    key: 'balanced',
    title: 'Balanced',
    description: 'Find the right balance between speed and accuracy',
    icon: <Sliders size={16} className="text-[#4CAF50]" />,
  },
  {
    key: 'quality',
    title: 'Quality',
    description: 'Get the most thorough and accurate answer',
    icon: (
      <Star
        size={16}
        className="text-[#2196F3] dark:text-[#BBDEFB] fill-[#BBDEFB] dark:fill-[#2196F3]"
      />
    ),
  },
];

const ModeList = ({
  onSelect,
}: {
  onSelect: (key: string) => void;
}) => {
  const { optimizationMode } = useChat();
  return (
    <>
      {OptimizationModes.map((mode, i) => (
        <button
          onClick={() => onSelect(mode.key)}
          key={i}
          className={cn(
            'p-2 rounded-lg flex flex-col items-start justify-start text-start space-y-1 duration-200 cursor-pointer transition focus:outline-none w-full',
            optimizationMode === mode.key
              ? 'bg-light-secondary dark:bg-dark-secondary'
              : 'hover:bg-light-secondary dark:hover:bg-dark-secondary',
          )}
        >
          <div className="flex flex-row justify-between w-full text-black dark:text-white">
            <div className="flex flex-row space-x-1">
              {mode.icon}
              <p className="text-xs font-medium">{mode.title}</p>
            </div>
            {mode.key === 'quality' && (
              <span className="bg-sky-500/70 dark:bg-sky-500/40 border border-sky-600 px-1 rounded-full text-[10px] text-white">
                Beta
              </span>
            )}
          </div>
          <p className="text-black/70 dark:text-white/70 text-xs">
            {mode.description}
          </p>
        </button>
      ))}
    </>
  );
};

const Optimization = () => {
  const { optimizationMode, setOptimizationMode } = useChat();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSelect = (key: string) => {
    setOptimizationMode(key);
    setMobileOpen(false);
  };

  return (
    <>
      {/* Desktop popover */}
      <Popover className="relative max-w-[15rem] md:max-w-md lg:max-w-lg hidden md:block">
        {({ open }) => (
          <>
            <PopoverButton
              type="button"
              className="p-2 text-black/50 dark:text-white/50 rounded-xl hover:bg-light-secondary dark:hover:bg-dark-secondary active:scale-95 transition duration-200 hover:text-black dark:hover:text-white focus:outline-none"
            >
              <div className="flex flex-row items-center space-x-1">
                {
                  OptimizationModes.find((mode) => mode.key === optimizationMode)
                    ?.icon
                }
                <ChevronDown
                  size={16}
                  className={cn(
                    open ? 'rotate-180' : 'rotate-0',
                    'transition duration:200',
                  )}
                />
              </div>
            </PopoverButton>
            <AnimatePresence>
              {open && (
                <PopoverPanel
                  className="absolute z-10 w-[250px] right-0 bottom-full mb-2"
                  static
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.1, ease: 'easeOut' }}
                    className="origin-bottom-right flex flex-col space-y-2 bg-light-primary dark:bg-dark-primary border rounded-lg border-light-200 dark:border-dark-200 w-full p-2 overflow-y-auto"
                  >
                    <ModeList onSelect={(key) => setOptimizationMode(key)} />
                  </motion.div>
                </PopoverPanel>
              )}
            </AnimatePresence>
          </>
        )}
      </Popover>

      {/* Mobile trigger + modal */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="p-2 text-black/50 dark:text-white/50 rounded-xl hover:bg-light-secondary dark:hover:bg-dark-secondary active:scale-95 transition duration-200 hover:text-black dark:hover:text-white focus:outline-none md:hidden"
      >
        <div className="flex flex-row items-center space-x-1">
          {
            OptimizationModes.find((mode) => mode.key === optimizationMode)
              ?.icon
          }
          <ChevronDown size={16} />
        </div>
      </button>

      <Transition appear show={mobileOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50 md:hidden"
          onClose={() => setMobileOpen(false)}
        >
          <div className="fixed inset-0 bg-black/30" />
          <div className="fixed inset-0 flex items-end justify-center">
            <DialogPanel className="w-full max-w-md rounded-t-2xl bg-light-primary dark:bg-dark-primary border border-light-200 dark:border-dark-200 p-4 pt-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-medium text-black/70 dark:text-white/70">
                  Optimization mode
                </p>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="p-1 text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              <ModeList onSelect={handleSelect} />
            </DialogPanel>
          </div>
        </Dialog>
      </Transition>
    </>
  );
};

export default Optimization;
