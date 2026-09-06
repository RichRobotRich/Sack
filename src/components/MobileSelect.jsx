import React, { useState, useEffect } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Drawer, DrawerContent } from '@/components/ui/drawer';

export default function MobileSelect({
  value,
  onValueChange,
  placeholder,
  children,
  triggerClassName,
  contentClassName,
}) {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!isMobile) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className={triggerClassName}>
            {placeholder}
          </button>
        </PopoverTrigger>
        <PopoverContent className={contentClassName}>
          {children}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <button className={triggerClassName}>
        {placeholder}
      </button>
      <DrawerContent className="max-h-96">
        <div className="overflow-y-auto p-4">
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  );
}