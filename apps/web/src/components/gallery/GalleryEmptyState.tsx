import { motion } from 'motion/react';
import { Images, Search } from 'lucide-react';

export function GalleryEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.2 }}
      className="col-span-full flex flex-col items-center justify-center gap-6 py-24 md:py-32"
    >
      <div className="relative">
        <Images className="h-24 w-24 stroke-[1] text-outline/20" />
        <motion.div
          animate={{ rotate: [0, 15, -5, 0] }}
          transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
          className="absolute -bottom-2 -right-2 -rotate-12 rounded-2xl bg-primary-container p-2.5 text-on-primary-container shadow-lg"
        >
          <Search className="h-6 w-6" />
        </motion.div>
      </div>
      <div className="space-y-2 text-center">
        <p className="font-headline text-2xl font-bold tracking-tight text-on-surface">{title}</p>
        <p className="text-sm text-outline/80">{description}</p>
      </div>
    </motion.div>
  );
}
