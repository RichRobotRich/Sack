import React, { useState, useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function PullToRefresh({ onRefresh, children }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartY = useRef(0);
  const containerRef = useRef(null);
  const threshold = 80;

  const handleTouchStart = (e) => {
    if (containerRef.current.scrollTop === 0) {
      touchStartY.current = e.touches[0].clientY;
      setIsDragging(true);
    }
  };

  const handleTouchMove = (e) => {
    if (!isDragging || isRefreshing) return;
    
    const touchY = e.touches[0].clientY;
    const distance = Math.max(0, touchY - touchStartY.current);
    
    if (distance > 0 && containerRef.current.scrollTop === 0) {
      e.preventDefault();
      setPullDistance(Math.min(distance * 0.5, threshold * 1.5));
    }
  };

  const handleTouchEnd = async () => {
    if (!isDragging) return;
    
    setIsDragging(false);
    
    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(threshold);
      
      try {
        await onRefresh();
      } catch (error) {
        console.error('Refresh error:', error);
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  };

  const progress = Math.min(pullDistance / threshold, 1);

  return (
    <div 
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="overflow-y-auto h-full"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {/* Pull indicator */}
      <div 
        className="fixed top-0 left-0 right-0 flex items-center justify-center pointer-events-none z-50 transition-opacity duration-200"
        style={{ 
          height: pullDistance,
          opacity: progress,
        }}
      >
        <div 
          className="bg-white dark:bg-gray-800 rounded-full shadow-lg p-3 transform"
          style={{
            transform: `scale(${progress}) rotate(${isRefreshing ? 0 : progress * 360}deg)`,
            transition: isRefreshing ? 'transform 0.3s ease' : 'none'
          }}
        >
          <Loader2 
            className={`w-5 h-5 text-[#1e3a5f] dark:text-blue-400 ${isRefreshing ? 'animate-spin' : ''}`}
          />
        </div>
      </div>
      
      {/* Content */}
      <div style={{ paddingTop: isRefreshing ? threshold : 0, transition: 'padding-top 0.3s ease' }}>
        {children}
      </div>
    </div>
  );
}