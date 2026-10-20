import { useEffect } from 'react';

/**
 * Robust, reference-counted Body Scroll Lock
 * Mencegah background page scrolling saat popup / modal terbuka.
 * Mempertahankan posisi scroll persis di tempat terakhir user membuka popup.
 */
let scrollLockCount = 0;
let originalBodyOverflow = '';
let originalBodyPaddingRight = '';
let savedScrollY = 0;
let lastKnownScrollY = 0;

// Pelacak posisi scroll aktif terus-menerus saat body tidak di-lock
if (typeof window !== 'undefined') {
  window.addEventListener('scroll', () => {
    if (scrollLockCount === 0) {
      const y = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
      if (y >= 0) {
        lastKnownScrollY = y;
      }
    }
  }, { passive: true });
}

export function lockBodyScroll() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  scrollLockCount++;

  if (scrollLockCount === 1) {
    const currentY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    savedScrollY = currentY > 0 ? currentY : lastKnownScrollY;
    originalBodyOverflow = document.body.style.overflow;
    originalBodyPaddingRight = document.body.style.paddingRight;

    // Hitung lebar scrollbar untuk mencegah layout shift
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
  }
}

export function unlockBodyScroll() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  scrollLockCount = Math.max(0, scrollLockCount - 1);

  if (scrollLockCount === 0) {
    document.body.style.overflow = originalBodyOverflow || '';
    document.documentElement.style.overflow = '';
    document.body.style.paddingRight = originalBodyPaddingRight || '';
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');

    const targetY = savedScrollY;

    // Kembalikan ke posisi scroll yang persis sama setelah browser menyelesaikan reflow DOM
    if (typeof window.scrollTo === 'function' && targetY > 0) {
      requestAnimationFrame(() => {
        window.scrollTo({
          top: targetY,
          left: 0,
          behavior: 'instant' as ScrollBehavior
        });
        setTimeout(() => {
          const currentNow = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
          if (Math.abs(currentNow - targetY) > 5) {
            window.scrollTo({
              top: targetY,
              left: 0,
              behavior: 'instant' as ScrollBehavior
            });
          }
        }, 20);
      });
    }
  }
}

/**
 * React Hook untuk mengunci scroll body saat `isLocked` bernilai true
 */
export function useBodyScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) return;

    lockBodyScroll();

    return () => {
      unlockBodyScroll();
    };
  }, [isLocked]);
}
