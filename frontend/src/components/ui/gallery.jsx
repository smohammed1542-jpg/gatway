import { forwardRef, useState, useEffect, useMemo } from 'react';
import { motion, useMotionValue } from 'framer-motion';
import { cn } from '../../lib/utils';

const FAN_LAYOUT_LG = [
  { order: 0, x: '-320px', y: '15px', zIndex: 5, direction: 'left' },
  { order: 1, x: '-160px', y: '32px', zIndex: 4, direction: 'left' },
  { order: 2, x: '0px', y: '8px', zIndex: 3, direction: 'right' },
  { order: 3, x: '160px', y: '22px', zIndex: 2, direction: 'right' },
  { order: 4, x: '320px', y: '44px', zIndex: 1, direction: 'left' },
];

const FAN_LAYOUT_MD = [
  { order: 0, x: '-200px', y: '12px', zIndex: 5, direction: 'left' },
  { order: 1, x: '-100px', y: '26px', zIndex: 4, direction: 'left' },
  { order: 2, x: '0px', y: '6px', zIndex: 3, direction: 'right' },
  { order: 3, x: '100px', y: '20px', zIndex: 2, direction: 'right' },
  { order: 4, x: '200px', y: '34px', zIndex: 1, direction: 'left' },
];

const FAN_LAYOUT_SM = [
  { order: 0, x: '-130px', y: '10px', zIndex: 5, direction: 'left' },
  { order: 1, x: '-65px', y: '22px', zIndex: 4, direction: 'left' },
  { order: 2, x: '0px', y: '4px', zIndex: 3, direction: 'right' },
  { order: 3, x: '65px', y: '16px', zIndex: 2, direction: 'right' },
  { order: 4, x: '130px', y: '28px', zIndex: 1, direction: 'left' },
];

const FAN_LAYOUT_XS = [
  { order: 0, x: '-88px', y: '8px', zIndex: 5, direction: 'left' },
  { order: 1, x: '-44px', y: '18px', zIndex: 4, direction: 'left' },
  { order: 2, x: '0px', y: '2px', zIndex: 3, direction: 'right' },
  { order: 3, x: '44px', y: '14px', zIndex: 2, direction: 'right' },
  { order: 4, x: '88px', y: '24px', zIndex: 1, direction: 'left' },
];

const PHOTO_SIZE = { xs: 108, sm: 140, md: 180, lg: 220 };
const FAN_HEIGHT = { xs: 220, sm: 260, md: 300, lg: 350 };

function getGalleryBreakpoint(width) {
  if (width < 480) return 'xs';
  if (width < 640) return 'sm';
  if (width < 1024) return 'md';
  return 'lg';
}

function getFanLayout(bp) {
  if (bp === 'xs') return FAN_LAYOUT_XS;
  if (bp === 'sm') return FAN_LAYOUT_SM;
  if (bp === 'md') return FAN_LAYOUT_MD;
  return FAN_LAYOUT_LG;
}

function useGalleryBreakpoint() {
  const [bp, setBp] = useState(() =>
    typeof window !== 'undefined' ? getGalleryBreakpoint(window.innerWidth) : 'lg',
  );

  useEffect(() => {
    const onResize = () => setBp(getGalleryBreakpoint(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return bp;
}

import { GALLERY_AI_IMAGE_LIST } from '../../constants/galleryImages';

const DEFAULT_STOCK = GALLERY_AI_IMAGE_LIST;

const containerVariants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.1,
    },
  },
};

const photoVariants = {
  hidden: () => ({
    x: 0,
    y: 0,
    rotate: 0,
    scale: 1,
  }),
  visible: (custom) => ({
    x: custom.x,
    y: custom.y,
    rotate: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 70,
      damping: 12,
      mass: 1,
      delay: custom.order * 0.15,
    },
  }),
};

function getRandomNumberInRange(min, max) {
  return Math.random() * (max - min) + min;
}

const MotionImg = motion.create(
  forwardRef(function MotionImg(props, ref) {
    return <img ref={ref} {...props} />;
  }),
);

export function Photo({
  src,
  fallbackSrc,
  alt,
  className,
  direction = 'right',
  width = 220,
  height = 220,
  onClick,
}) {
  const [rotation, setRotation] = useState(0);
  const [displaySrc, setDisplaySrc] = useState(src);
  const x = useMotionValue(200);
  const y = useMotionValue(200);

  useEffect(() => {
    setDisplaySrc(src);
  }, [src]);

  useEffect(() => {
    const randomRotation = getRandomNumberInRange(1, 4) * (direction === 'left' ? -1 : 1);
    setRotation(randomRotation);
  }, [direction]);

  const handleImageError = () => {
    if (fallbackSrc && displaySrc !== fallbackSrc) {
      setDisplaySrc(fallbackSrc);
    }
  };

  function handleMouse(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    x.set(event.clientX - rect.left);
    y.set(event.clientY - rect.top);
  }

  const resetMouse = () => {
    x.set(200);
    y.set(200);
  };

  return (
    <motion.div
      drag
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      whileTap={{ scale: 1.12, zIndex: 10 }}
      whileHover={{
        scale: 1.08,
        rotateZ: 2 * (direction === 'left' ? -1 : 1),
        zIndex: 10,
      }}
      whileDrag={{ scale: 1.08, zIndex: 10 }}
      initial={{ rotate: 0 }}
      animate={{ rotate: rotation }}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      style={{
        width,
        height,
        perspective: 400,
        zIndex: 1,
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
        touchAction: 'none',
      }}
      className={cn(
        className,
        'relative mx-auto shrink-0 cursor-grab active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5bd51e] focus-visible:ring-offset-2 rounded-3xl',
      )}
      onMouseMove={handleMouse}
      onMouseLeave={resetMouse}
      draggable={false}
      tabIndex={onClick ? 0 : -1}
      role={onClick ? 'button' : undefined}
      aria-label={onClick ? `View ${alt}` : undefined}
    >
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-3xl bg-slate-50 shadow-[0_20px_50px_rgba(15,23,42,0.18)] ring-1 ring-slate-200/80">
        <MotionImg
          className="h-full w-full rounded-3xl object-cover pointer-events-none"
          src={displaySrc}
          alt={alt}
          draggable={false}
          loading="lazy"
          onError={handleImageError}
        />
      </div>
    </motion.div>
  );
}

export function PhotoGallery({
  animationDelay = 0.35,
  photos = [],
  kicker = 'Showcase',
  title = 'Venue',
  titleAccent = 'Gallery',
  subtitle,
  onViewAll,
  onPhotoClick,
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const breakpoint = useGalleryBreakpoint();
  const photoSize = PHOTO_SIZE[breakpoint];
  const fanHeight = FAN_HEIGHT[breakpoint];

  const displayPhotos = useMemo(() => {
    const fanLayout = getFanLayout(breakpoint);
    const source = photos.length ? photos.slice(0, 5) : DEFAULT_STOCK.map((src, i) => ({
      id: i,
      src,
      alt: 'Venue photo',
    }));

    return source.map((item, index) => {
      const layout = fanLayout[index] || fanLayout[fanLayout.length - 1];
      return {
        id: item.id ?? index,
        order: layout.order,
        x: layout.x,
        y: layout.y,
        zIndex: layout.zIndex,
        direction: layout.direction,
        src: item.src,
        fallbackSrc: item.fallbackSrc,
        alt: item.alt || item.title || 'Venue photo',
        index,
      };
    });
  }, [photos, breakpoint]);

  useEffect(() => {
    const visibilityTimer = setTimeout(() => setIsVisible(true), animationDelay * 1000);
    const animationTimer = setTimeout(
      () => setIsLoaded(true),
      (animationDelay + 0.4) * 1000,
    );

    return () => {
      clearTimeout(visibilityTimer);
      clearTimeout(animationTimer);
    };
  }, [animationDelay]);

  return (
    <div className="landing-photo-gallery relative">
      <div
        className="landing-photo-gallery__grid-bg absolute inset-0 -z-10 hidden h-[300px] w-full bg-transparent opacity-20 md:block"
        aria-hidden
      />

      <div className="landing-photo-gallery__header">
        {kicker && (
          <p className="landing-photo-gallery__kicker">{kicker}</p>
        )}

        <h3 className="landing-photo-gallery__title">
          {title}{' '}
          <span className="landing-photo-gallery__title-accent">{titleAccent}</span>
        </h3>

        {subtitle && (
          <p className="landing-photo-gallery__subtitle">{subtitle}</p>
        )}
      </div>

      <div
        className="relative mb-8 mt-6 flex w-full items-center justify-center overflow-hidden lg:mt-10"
        style={{ height: `${fanHeight}px` }}
      >
        <motion.div
          className="relative mx-auto flex w-full max-w-7xl justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: isVisible ? 1 : 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <motion.div
            className="landing-photo-gallery__fan relative flex w-full justify-center"
            variants={containerVariants}
            initial="hidden"
            animate={isLoaded ? 'visible' : 'hidden'}
          >
            <div
              className="relative"
              style={{ width: photoSize, height: photoSize }}
            >
              {[...displayPhotos].reverse().map((photo) => (
                <motion.div
                  key={photo.id}
                  className="absolute left-0 top-0"
                  style={{ zIndex: photo.zIndex }}
                  variants={photoVariants}
                  custom={{
                    x: photo.x,
                    y: photo.y,
                    order: photo.order,
                  }}
                >
                  <Photo
                    width={photoSize}
                    height={photoSize}
                    src={photo.src}
                    fallbackSrc={photo.fallbackSrc}
                    alt={photo.alt}
                    direction={photo.direction}
                    onClick={onPhotoClick ? () => onPhotoClick(photo.index) : undefined}
                    className="landing-photo-gallery__photo"
                  />
                </motion.div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </div>

      <div className="landing-photo-gallery__cta">
        <button type="button" className="landing-btn-primary" onClick={onViewAll}>
          View Full Gallery
        </button>
      </div>
    </div>
  );
}
