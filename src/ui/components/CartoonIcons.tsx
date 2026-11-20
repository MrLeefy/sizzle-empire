import React from 'react';
import type {
  EquippedSlotKey,
  GearSlot,
  PetSpeciesTemplate,
  StationTemplate,
} from '@/types/game';

export interface CartoonIconProps {
  size?: number;
  className?: string;
  title?: string;
}

export type StationModelStyle = StationTemplate['modelStyle'];

const STROKE = '#3D2314';

const IconSvg: React.FC<CartoonIconProps & { children: React.ReactNode }> = ({
  size = 20,
  className,
  title,
  children,
}) => (
  <svg
    viewBox="0 0 32 32"
    width={size}
    height={size}
    fill="none"
    className={className ? `cartoon-icon ${className}` : 'cartoon-icon'}
    aria-hidden={title ? undefined : true}
    role={title ? 'img' : undefined}
  >
    {title ? <title>{title}</title> : null}
    {children}
  </svg>
);

/* ---------- CORE HUD, NAV, SKILLS & ACTION ICONS ---------- */

export const CashIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <rect x="4" y="10" width="24" height="15" rx="4" fill="#16A34A" stroke={STROKE} strokeWidth="2.2" />
    <rect x="3" y="7" width="25" height="15" rx="4" fill="#4ADE80" stroke={STROKE} strokeWidth="2.2" />
    <path d="M5 18 H26 V20 C26 21 25 21 24 21 H7 C6 21 5 21 5 20 Z" fill="#22C55E" />
    <rect x="12" y="7" width="7" height="15" fill="#FDE047" stroke={STROKE} strokeWidth="1.8" />
    <path d="M15.5 11 V18 M13.8 12.8 C13.8 11.7 17.2 11.7 17.2 12.9 C17.2 14.2 13.8 14.3 13.8 15.8 C13.8 17 17.2 17 17.2 15.9" stroke={STROKE} strokeWidth="1.7" strokeLinecap="round" />
    <rect x="5.5" y="9" width="5" height="2.4" rx="1.2" fill="#FFFFFF" fillOpacity="0.65" />
    <circle cx="8" cy="14.5" r="1.4" fill="#15803D" />
    <circle cx="23" cy="14.5" r="1.4" fill="#15803D" />
  </IconSvg>
);

export const GemIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <polygon points="9,6 23,6 29,13 16,28 3,13" fill="#38BDF8" stroke={STROKE} strokeWidth="2.3" strokeLinejoin="round" />
    <polygon points="9,6 23,6 21,13 11,13" fill="#7DD3FC" />
    <polygon points="3,13 11,13 16,28" fill="#0284C7" fillOpacity="0.55" />
    <polygon points="21,13 29,13 16,28" fill="#0369A1" fillOpacity="0.45" />
    <path d="M3.5 13 H28.5 M11 13 L9 6 M21 13 L23 6 M11 13 L16 27 M21 13 L16 27" stroke={STROKE} strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M10.5 8.2 H18" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.78" />
    <circle cx="22.5" cy="9.5" r="1.4" fill="#FFFFFF" />
  </IconSvg>
);

export const FlameIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path
      d="M16.5 3 C20 8.5 25 11.5 25 18.2 C25 24 21 28.5 16 28.5 C10.6 28.5 7 24.4 7 18.8 C7 14.5 9.2 11.5 11 9.8 C11 12.2 12.2 13.5 13.2 13.5 C12.5 9.5 14 5.5 16.5 3 Z"
      fill="#F97316"
      stroke={STROKE}
      strokeWidth="2.3"
      strokeLinejoin="round"
    />
    <path
      d="M16.2 12.5 C19.2 15.8 21.2 18.2 21.2 21.2 C21.2 24.4 18.8 26.8 16 26.8 C13 26.8 11 24.4 11 21.4 C11 18.5 13.4 15.8 16.2 12.5 Z"
      fill="#FDE047"
    />
    <ellipse cx="14.5" cy="19.5" rx="1.7" ry="2.8" transform="rotate(-14 14.5 19.5)" fill="#FFFFFF" fillOpacity="0.72" />
  </IconSvg>
);

export const CoinIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <circle cx="16.5" cy="17" r="11.5" fill="#D97706" stroke={STROKE} strokeWidth="2.3" />
    <circle cx="15.5" cy="15.5" r="11" fill="#FDE047" stroke={STROKE} strokeWidth="2.3" />
    <circle cx="15.5" cy="15.5" r="7.8" fill="#F59E0B" stroke={STROKE} strokeWidth="1.5" />
    <path d="M15.5 10.6 L16.9 13.7 L20.2 14.1 L17.7 16.3 L18.4 19.6 L15.5 17.9 L12.6 19.6 L13.3 16.3 L10.8 14.1 L14.1 13.7 Z" fill="#FEF9C3" stroke={STROKE} strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M9.5 9.8 A7.5 7.5 0 0 1 16 7.4" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.75" />
  </IconSvg>
);

export const CrownIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path
      d="M4 22 L6.5 9.5 L12.2 15 L16 7.5 L19.8 15 L25.5 9.5 L28 22 Z"
      fill="#FDE047"
      stroke={STROKE}
      strokeWidth="2.3"
      strokeLinejoin="round"
    />
    <rect x="4.5" y="21" width="23" height="5" rx="2" fill="#F59E0B" stroke={STROKE} strokeWidth="2.2" />
    <circle cx="16" cy="17.2" r="2.1" fill="#F472B6" stroke={STROKE} strokeWidth="1.4" />
    <circle cx="10.2" cy="18.2" r="1.6" fill="#38BDF8" stroke={STROKE} strokeWidth="1.3" />
    <circle cx="21.8" cy="18.2" r="1.6" fill="#38BDF8" stroke={STROKE} strokeWidth="1.3" />
    <circle cx="16" cy="7.2" r="1.9" fill="#FEF08A" stroke={STROKE} strokeWidth="1.6" />
    <path d="M7.5 22.8 H14.5" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.65" />
  </IconSvg>
);

export const ChefHatIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path
      d="M9 19 C5.2 18.2 4.8 12.6 8.6 11.2 C9.5 6.8 13.8 5.2 16 6.8 C18.2 5.2 22.5 6.8 23.4 11.2 C27.2 12.6 26.8 18.2 23 19 Z"
      fill="#FFFBF0"
      stroke={STROKE}
      strokeWidth="2.3"
      strokeLinejoin="round"
    />
    <path d="M12.5 17 V12.5 M16 17 V11.5 M19.5 17 V12.5" stroke="#D9B88C" strokeWidth="1.8" strokeLinecap="round" />
    <rect x="8.5" y="18.5" width="15" height="7.5" rx="2.5" fill="#FFFBF0" stroke={STROKE} strokeWidth="2.2" />
    <rect x="9.5" y="22" width="13" height="3.2" rx="1" fill="#F97316" />
    <line x1="9" y1="22" x2="23" y2="22" stroke={STROKE} strokeWidth="1.5" />
    <ellipse cx="11.8" cy="10.5" rx="2.4" ry="1.2" transform="rotate(-24 11.8 10.5)" fill="#FFFFFF" />
  </IconSvg>
);

export const CrateIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <rect x="5" y="11" width="22" height="17" rx="3.5" fill="#F59E0B" stroke={STROKE} strokeWidth="2.3" />
    <rect x="4" y="8" width="24" height="6" rx="2.5" fill="#FDE047" stroke={STROKE} strokeWidth="2.3" />
    <rect x="13.5" y="8" width="5" height="20" fill="#EF4444" stroke={STROKE} strokeWidth="1.8" />
    <path d="M16 8 C13.5 3.5 9 4.2 9.8 7.5 C10.3 9 13.6 8.5 16 8 Z" fill="#FB923C" stroke={STROKE} strokeWidth="1.9" strokeLinejoin="round" />
    <path d="M16 8 C18.5 3.5 23 4.2 22.2 7.5 C21.7 9 18.4 8.5 16 8 Z" fill="#F87171" stroke={STROKE} strokeWidth="1.9" strokeLinejoin="round" />
    <rect x="6.8" y="9.8" width="5.2" height="1.8" rx="0.9" fill="#FFFFFF" fillOpacity="0.65" />
    <circle cx="8.5" cy="17.5" r="1.1" fill={STROKE} />
    <circle cx="23.5" cy="17.5" r="1.1" fill={STROKE} />
  </IconSvg>
);

export const BoltIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path
      d="M18.5 3.5 L7.5 17.2 H15.2 L13 28.5 L24.8 14.2 H16.8 Z"
      fill="#FDE047"
      stroke={STROKE}
      strokeWidth="2.3"
      strokeLinejoin="round"
    />
    <path d="M15.6 15.2 L22 15.2 L14.4 25 L16 17.5 Z" fill="#FB923C" />
    <path d="M16.2 6.8 L11 14.2" stroke="#FFFFFF" strokeWidth="1.9" strokeLinecap="round" strokeOpacity="0.78" />
  </IconSvg>
);

export const ShieldIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path
      d="M16 3.5 L26.5 7.5 V15.2 C26.5 21.8 21.8 26.2 16 28.5 C10.2 26.2 5.5 21.8 5.5 15.2 V7.5 Z"
      fill="#60A5FA"
      stroke={STROKE}
      strokeWidth="2.3"
      strokeLinejoin="round"
    />
    <path
      d="M16 5.5 L24.5 8.8 V15.2 C24.5 20.5 20.6 24.3 16 26.3 V5.5 Z"
      fill="#2563EB"
      fillOpacity="0.52"
    />
    <path
      d="M16 10 L17.6 13.4 L21.4 13.9 L18.6 16.5 L19.3 20.2 L16 18.4 L12.7 20.2 L13.4 16.5 L10.6 13.9 L14.4 13.4 Z"
      fill="#FDE047"
      stroke={STROKE}
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path d="M8.5 9.6 L13.5 7.7" stroke="#FFFFFF" strokeWidth="1.9" strokeLinecap="round" strokeOpacity="0.75" />
  </IconSvg>
);

export const ShieldCheckIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path
      d="M16 3.5 L26.5 7.5 V15.2 C26.5 21.8 21.8 26.2 16 28.5 C10.2 26.2 5.5 21.8 5.5 15.2 V7.5 Z"
      fill="#4ADE80"
      stroke={STROKE}
      strokeWidth="2.3"
      strokeLinejoin="round"
    />
    <path d="M16 5.5 L24.5 8.8 V15.2 C24.5 20.5 20.6 24.3 16 26.3 V5.5 Z" fill="#16A34A" fillOpacity="0.4" />
    <path d="M11 16.2 L14.5 19.6 L21.5 12.2" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M11 16.2 L14.5 19.6 L21.5 12.2" stroke={STROKE} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </IconSvg>
);

export const PawIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <ellipse cx="8" cy="13.5" rx="3" ry="3.8" transform="rotate(-18 8 13.5)" fill="#F472B6" stroke={STROKE} strokeWidth="2.1" />
    <ellipse cx="13.5" cy="8.5" rx="2.9" ry="3.8" transform="rotate(-6 13.5 8.5)" fill="#F472B6" stroke={STROKE} strokeWidth="2.1" />
    <ellipse cx="19.5" cy="8.8" rx="2.9" ry="3.8" transform="rotate(8 19.5 8.8)" fill="#F472B6" stroke={STROKE} strokeWidth="2.1" />
    <ellipse cx="24.5" cy="14" rx="3" ry="3.8" transform="rotate(20 24.5 14)" fill="#F472B6" stroke={STROKE} strokeWidth="2.1" />
    <path
      d="M16 14.5 C20.8 14.5 23.8 18.8 23.2 22.8 C22.6 26 19.5 26.8 16 25.6 C12.5 26.8 9.4 26 8.8 22.8 C8.2 18.8 11.2 14.5 16 14.5 Z"
      fill="#F472B6"
      stroke={STROKE}
      strokeWidth="2.2"
      strokeLinejoin="round"
    />
    <ellipse cx="14.2" cy="18.2" rx="3.2" ry="1.8" transform="rotate(-14 14.2 18.2)" fill="#FBCFE8" />
  </IconSvg>
);

export const VaultIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <polygon points="16,4 28,11 4,11" fill="#FDE047" stroke={STROKE} strokeWidth="2.2" strokeLinejoin="round" />
    <rect x="5" y="23.5" width="22" height="4" rx="1.5" fill="#F59E0B" stroke={STROKE} strokeWidth="2.2" />
    <rect x="7" y="11" width="18" height="12.5" fill="#FFF3D6" stroke={STROKE} strokeWidth="2" />
    <rect x="8.5" y="11.5" width="3.2" height="11.5" fill="#FDE047" stroke={STROKE} strokeWidth="1.5" />
    <rect x="20.3" y="11.5" width="3.2" height="11.5" fill="#FDE047" stroke={STROKE} strokeWidth="1.5" />
    <circle cx="16" cy="17.2" r="3.2" fill="#F59E0B" stroke={STROKE} strokeWidth="1.6" />
    <circle cx="15.3" cy="16.4" r="1" fill="#FEF9C3" />
  </IconSvg>
);

export const TentIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <line x1="16" y1="4" x2="16" y2="9" stroke={STROKE} strokeWidth="2.2" strokeLinecap="round" />
    <polygon points="16,4 23,6.5 16,9" fill="#FDE047" stroke={STROKE} strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M5 17 L16 8.5 L27 17 Z" fill="#F97316" stroke={STROKE} strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M11 17 L16 8.5 L21 17 Z" fill="#FFFBF0" stroke={STROKE} strokeWidth="1.8" strokeLinejoin="round" />
    <rect x="6" y="17" width="20" height="10" rx="1.5" fill="#FFFBF0" stroke={STROKE} strokeWidth="2.2" />
    <rect x="6" y="17" width="5" height="10" fill="#FB923C" stroke={STROKE} strokeWidth="1.6" />
    <rect x="21" y="17" width="5" height="10" fill="#FB923C" stroke={STROKE} strokeWidth="1.6" />
    <path d="M13 27 V21.5 A3 3 0 0 1 19 21.5 V27 Z" fill="#7A553A" stroke={STROKE} strokeWidth="1.8" />
  </IconSvg>
);

export const TrophyIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path d="M9 9 H5.5 C5.5 14.5 7.5 17 11 17" stroke={STROKE} strokeWidth="2.3" strokeLinecap="round" />
    <path d="M23 9 H26.5 C26.5 14.5 24.5 17 21 17" stroke={STROKE} strokeWidth="2.3" strokeLinecap="round" />
    <path d="M9 6 H23 V13.5 C23 17.8 20 20.5 16 20.5 C12 20.5 9 17.8 9 13.5 Z" fill="#FDE047" stroke={STROKE} strokeWidth="2.3" strokeLinejoin="round" />
    <rect x="14" y="20.2" width="4" height="4.2" fill="#F59E0B" stroke={STROKE} strokeWidth="1.8" />
    <rect x="10" y="24" width="12" height="4" rx="1.8" fill="#7A553A" stroke={STROKE} strokeWidth="2.1" />
    <path d="M12 8.8 V14" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.72" />
  </IconSvg>
);

export const ClubIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <circle cx="11.5" cy="11.5" r="4.5" fill="#FDE6B8" stroke={STROKE} strokeWidth="2.1" />
    <path d="M4.5 25.5 C4.5 20.2 7.5 17.5 11.5 17.5 C15.5 17.5 18.5 20.2 18.5 25.5 Z" fill="#60A5FA" stroke={STROKE} strokeWidth="2.1" strokeLinejoin="round" />
    <circle cx="21" cy="12.5" r="4" fill="#FED7AA" stroke={STROKE} strokeWidth="2.1" />
    <path d="M15.5 25.5 C15.8 20.8 18 18.5 21.5 18.5 C25 18.5 27.5 20.8 27.5 25.5 Z" fill="#FB923C" stroke={STROKE} strokeWidth="2.1" strokeLinejoin="round" />
    <path d="M16 4.2 L17 6.4 L19.4 6.7 L17.6 8.3 L18.1 10.6 L16 9.5 L13.9 10.6 L14.4 8.3 L12.6 6.7 L15 6.4 Z" fill="#FDE047" stroke={STROKE} strokeWidth="1.4" strokeLinejoin="round" />
  </IconSvg>
);

export const SettingsIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path
      d="M13.5 4.2 H18.5 L19.4 7.5 C20.3 7.8 21.2 8.2 22 8.8 L25 7.2 L28 10.8 L25.6 13.4 C25.9 14.3 26.1 15.1 26.1 16 C26.1 16.9 25.9 17.7 25.6 18.6 L28 21.2 L25 24.8 L22 23.2 C21.2 23.8 20.3 24.2 19.4 24.5 L18.5 27.8 H13.5 L12.6 24.5 C11.7 24.2 10.8 23.8 10 23.2 L7 24.8 L4 21.2 L6.4 18.6 C6.1 17.7 5.9 16.9 5.9 16 C5.9 15.1 6.1 14.3 6.4 13.4 L4 10.8 L7 7.2 L10 8.8 C10.8 8.2 11.7 7.8 12.6 7.5 Z"
      fill="#FFFBF0"
      stroke={STROKE}
      strokeWidth="2.2"
      strokeLinejoin="round"
    />
    <circle cx="16" cy="16" r="5" fill="#FDE047" stroke={STROKE} strokeWidth="2.2" />
    <circle cx="14.7" cy="14.5" r="1.4" fill="#FFFFFF" />
  </IconSvg>
);

export const SparkleIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path
      d="M15 4 L17.6 12.4 L26 15 L17.6 17.6 L15 26 L12.4 17.6 L4 15 L12.4 12.4 Z"
      fill="#FDE047"
      stroke={STROKE}
      strokeWidth="2.1"
      strokeLinejoin="round"
    />
    <path d="M24.5 5.5 L25.5 8 L28 9 L25.5 10 L24.5 12.5 L23.5 10 L21 9 L23.5 8 Z" fill="#FFFFFF" stroke={STROKE} strokeWidth="1.4" strokeLinejoin="round" />
    <circle cx="8" cy="24" r="2" fill="#FB923C" stroke={STROKE} strokeWidth="1.4" />
  </IconSvg>
);

export const AirplaneIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path
      d="M27.2 5.4 C25.2 4 21.5 5.4 17.5 9.2 L7.2 7.5 L4.6 10.2 L12.8 14.4 L9.2 18.2 L5.8 17.6 L4 19.6 L8.6 22 L11 26.8 L13.2 25 L12.6 21.4 L16.6 17.8 L20.8 26.2 L23.6 23.6 L21.8 13.4 C25.8 9.6 28.4 6.4 27.2 5.4 Z"
      fill="#60A5FA"
      stroke={STROKE}
      strokeWidth="2.2"
      strokeLinejoin="round"
    />
    <path d="M12.8 14.4 L16.6 17.8 L21.8 13.4 L17.5 9.2 Z" fill="#FFFBF0" />
    <circle cx="21.5" cy="9.5" r="1.8" fill="#FDE047" stroke={STROKE} strokeWidth="1.3" />
    <path d="M22.8 6.8 L18.5 10.6" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeOpacity="0.8" />
  </IconSvg>
);

export const MegaphoneIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path d="M9 19 L11.5 26.2 H15 L13.4 19" fill="#F59E0B" stroke={STROKE} strokeWidth="2.1" strokeLinejoin="round" />
    <path d="M5 13.5 H11 L22.5 7.5 V22.5 L11 18.5 H5 C4 18.5 3.5 17.6 3.5 16 C3.5 14.4 4 13.5 5 13.5 Z" fill="#FB923C" stroke={STROKE} strokeWidth="2.2" strokeLinejoin="round" />
    <ellipse cx="22.5" cy="15" rx="2.4" ry="7.4" fill="#FDE047" stroke={STROKE} strokeWidth="2" />
    <path d="M26.5 11.5 C28 13.2 28 16.8 26.5 18.5" stroke={STROKE} strokeWidth="2.1" strokeLinecap="round" />
    <path d="M12.5 12.6 L19 9.8" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeOpacity="0.7" />
  </IconSvg>
);

export const InvestorIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path d="M12 10 V7.5 C12 6.2 13 5.5 14.2 5.5 H17.8 C19 5.5 20 6.2 20 7.5 V10" stroke={STROKE} strokeWidth="2.3" strokeLinecap="round" />
    <rect x="4.5" y="10" width="23" height="16.5" rx="4" fill="#F59E0B" stroke={STROKE} strokeWidth="2.3" />
    <path d="M4.5 15.5 H27.5" stroke={STROKE} strokeWidth="2" />
    <rect x="13" y="13.5" width="6" height="4.8" rx="1.5" fill="#4ADE80" stroke={STROKE} strokeWidth="1.8" />
    <rect x="7" y="11.8" width="5" height="1.8" rx="0.9" fill="#FFFFFF" fillOpacity="0.65" />
  </IconSvg>
);

export const PotionIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <rect x="13" y="4" width="6" height="4" rx="1.2" fill="#D97706" stroke={STROKE} strokeWidth="2" />
    <path d="M12 8 H20 V11.5 L25.2 18.2 C26.6 20 26.2 26.5 22 27.5 H10 C5.8 26.5 5.4 20 6.8 18.2 L12 11.5 Z" fill="#E0F2FE" stroke={STROKE} strokeWidth="2.3" strokeLinejoin="round" />
    <path d="M8.4 19.5 C11 18.2 21 18.2 23.6 19.5 C24.6 22 23.8 25.4 21.4 26 H10.6 C8.2 25.4 7.4 22 8.4 19.5 Z" fill="#C084FC" />
    <circle cx="13.5" cy="22.4" r="1.4" fill="#FDE047" />
    <circle cx="18.2" cy="21" r="1.1" fill="#FFFFFF" />
    <path d="M11 14 L9.2 17" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeOpacity="0.85" />
  </IconSvg>
);

export const LockIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path d="M10.5 14 V10.5 A5.5 5.5 0 0 1 21.5 10.5 V14" stroke={STROKE} strokeWidth="2.8" strokeLinecap="round" />
    <rect x="6.5" y="13.5" width="19" height="14" rx="3.8" fill="#FDE047" stroke={STROKE} strokeWidth="2.3" />
    <path d="M8.5 23.5 H23.5 V25 C23.5 25.8 22.8 26.2 22 26.2 H10 C9.2 26.2 8.5 25.8 8.5 25 Z" fill="#F59E0B" />
    <circle cx="16" cy="19.5" r="2" fill={STROKE} />
    <path d="M16 20.5 V23.6" stroke={STROKE} strokeWidth="2.1" strokeLinecap="round" />
    <rect x="9" y="15.4" width="4.5" height="1.8" rx="0.9" fill="#FFFFFF" fillOpacity="0.7" />
  </IconSvg>
);

export const CheckIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <circle cx="16" cy="16" r="12" fill="#4ADE80" stroke={STROKE} strokeWidth="2.3" />
    <path d="M10.5 16.5 L14.4 20.4 L22 12" stroke="#FFFFFF" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10.5 16.5 L14.4 20.4 L22 12" stroke={STROKE} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </IconSvg>
);

export const CloseIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path d="M9 9 L23 23 M23 9 L9 23" stroke={STROKE} strokeWidth="5.2" strokeLinecap="round" />
    <path d="M9 9 L23 23 M23 9 L9 23" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" />
  </IconSvg>
);

export const BackArrowIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path d="M15 7 L6 16 L15 25 V19.5 H26 V12.5 H15 Z" fill="#FFFBF0" stroke={STROKE} strokeWidth="2.4" strokeLinejoin="round" />
    <path d="M14 14.6 H23.5" stroke="#FDE047" strokeWidth="1.8" strokeLinecap="round" />
  </IconSvg>
);

export const RenovateIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path d="M4.5 15.5 L16 6 L27.5 15.5 Z" fill="#FB923C" stroke={STROKE} strokeWidth="2.3" strokeLinejoin="round" />
    <rect x="7.5" y="15.5" width="17" height="11.5" rx="2" fill="#FFFBF0" stroke={STROKE} strokeWidth="2.3" />
    <rect x="13" y="19.5" width="6" height="7.5" rx="1.5" fill="#FDE047" stroke={STROKE} strokeWidth="1.9" />
    <path d="M24 5 L25 7.4 L27.4 8.4 L25 9.4 L24 11.8 L23 9.4 L20.6 8.4 L23 7.4 Z" fill="#FDE047" stroke={STROKE} strokeWidth="1.4" strokeLinejoin="round" />
  </IconSvg>
);

export const ClockIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <circle cx="16" cy="17" r="11" fill="#FB923C" stroke={STROKE} strokeWidth="2.3" />
    <circle cx="16" cy="17" r="8.2" fill="#FFFBF0" stroke={STROKE} strokeWidth="1.8" />
    <rect x="13.5" y="3.5" width="5" height="3" rx="1.2" fill="#FDE047" stroke={STROKE} strokeWidth="1.8" />
    <path d="M16 12 V17 L19.8 19" stroke={STROKE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="16" cy="17" r="1.4" fill="#EF4444" />
  </IconSvg>
);

export const KeyIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <circle cx="11" cy="16" r="6.2" fill="#FDE047" stroke={STROKE} strokeWidth="2.3" />
    <circle cx="11" cy="16" r="2.2" fill="#38BDF8" stroke={STROKE} strokeWidth="1.5" />
    <path d="M17 14.5 H27.5 V18 H24.8 V21 H22 V18 H17 Z" fill="#F59E0B" stroke={STROKE} strokeWidth="2.1" strokeLinejoin="round" />
    <path d="M8.5 12.2 A4 4 0 0 1 13 11.4" stroke="#FFFFFF" strokeWidth="1.7" strokeLinecap="round" strokeOpacity="0.8" />
  </IconSvg>
);

export const EggIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path d="M16 4.5 C21.5 4.5 25 13 25 19 C25 24.5 21 27.8 16 27.8 C11 27.8 7 24.5 7 19 C7 13 10.5 4.5 16 4.5 Z" fill="#FFFBF0" stroke={STROKE} strokeWidth="2.3" />
    <circle cx="13" cy="14" r="2.3" fill="#F472B6" />
    <circle cx="19.5" cy="18.5" r="2.6" fill="#60A5FA" />
    <circle cx="13.5" cy="22.5" r="1.8" fill="#FDE047" />
    <ellipse cx="12.2" cy="9.8" rx="1.4" ry="2.6" transform="rotate(18 12.2 9.8)" fill="#FFFFFF" />
  </IconSvg>
);

export const TreatIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path
      d="M7.5 12 C5.2 12 4.2 9.6 5.6 8 C6.9 6.6 9.2 7.2 9.8 9.2 L22.2 18.8 C24.2 18.2 26.4 19.2 26.8 21.2 C27.2 23.2 25.2 24.8 23.2 24 C22.8 26 20.6 27 18.8 25.8 C17.4 24.8 17.4 22.8 18.4 21.4 L8.6 13.8 C7.4 14.5 5.4 14 5.2 12.2"
      fill="#FB923C"
      stroke={STROKE}
      strokeWidth="2.2"
      strokeLinejoin="round"
    />
    <ellipse cx="15.8" cy="15.8" rx="5.8" ry="4.2" transform="rotate(37 15.8 15.8)" fill="#F97316" stroke={STROKE} strokeWidth="2.1" />
    <ellipse cx="14.5" cy="13.8" rx="2.4" ry="1.1" transform="rotate(37 14.5 13.8)" fill="#FFFBF0" fillOpacity="0.65" />
  </IconSvg>
);

export const SpeakerIcon: React.FC<CartoonIconProps & { muted?: boolean }> = ({
  muted = false,
  ...props
}) => (
  <IconSvg {...props}>
    <path d="M5.5 12.5 H10.5 L17.5 7 V25 L10.5 19.5 H5.5 C4.6 19.5 4 18.9 4 18 V14 C4 13.1 4.6 12.5 5.5 12.5 Z" fill="#60A5FA" stroke={STROKE} strokeWidth="2.2" strokeLinejoin="round" />
    {muted ? (
      <>
        <path d="M21 12.5 L27.5 19.5 M27.5 12.5 L21 19.5" stroke="#EF4444" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M21 12.5 L27.5 19.5 M27.5 12.5 L21 19.5" stroke={STROKE} strokeWidth="1.2" strokeLinecap="round" />
      </>
    ) : (
      <>
        <path d="M21.2 12.5 C23.2 14.3 23.2 17.7 21.2 19.5" stroke={STROKE} strokeWidth="2.3" strokeLinecap="round" />
        <path d="M24.6 9.5 C27.8 12.8 27.8 19.2 24.6 22.5" stroke={STROKE} strokeWidth="2.3" strokeLinecap="round" />
      </>
    )}
    <path d="M12.2 12.6 L15.4 10.2" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeOpacity="0.78" />
  </IconSvg>
);

export const MusicNoteIcon: React.FC<CartoonIconProps & { muted?: boolean }> = ({
  muted = false,
  ...props
}) => (
  <IconSvg {...props}>
    <path d="M12.5 22 V8.5 L25.5 5.5 V19" stroke={STROKE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12.5 12 L25.5 9" stroke="#FDE047" strokeWidth="3" strokeLinecap="round" />
    <ellipse cx="9.8" cy="22.5" rx="3.8" ry="2.9" transform="rotate(-15 9.8 22.5)" fill="#F472B6" stroke={STROKE} strokeWidth="2.1" />
    <ellipse cx="22.8" cy="19.5" rx="3.8" ry="2.9" transform="rotate(-15 22.8 19.5)" fill="#FDE047" stroke={STROKE} strokeWidth="2.1" />
    {muted && <path d="M6 6 L26 26" stroke="#EF4444" strokeWidth="3.2" strokeLinecap="round" />}
  </IconSvg>
);

export const RefreshIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path d="M25.5 15.5 A9.5 9.5 0 1 1 22.8 9" stroke={STROKE} strokeWidth="4.4" strokeLinecap="round" />
    <path d="M25.5 15.5 A9.5 9.5 0 1 1 22.8 9" stroke="#FFFFFF" strokeWidth="2.1" strokeLinecap="round" />
    <polygon points="24,4.5 26.5,11.5 19.5,10.8" fill="#FDE047" stroke={STROKE} strokeWidth="1.8" strokeLinejoin="round" />
  </IconSvg>
);

export const BlueprintIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <rect x="5" y="6" width="22" height="20" rx="3.5" fill="#2563EB" stroke={STROKE} strokeWidth="2.3" />
    <path d="M9 12 H23 M9 16.5 H23 M9 21 H17 M13.5 9.5 V22.5" stroke="#93C5FD" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="21" cy="20.5" r="2.6" fill="#FDE047" stroke={STROKE} strokeWidth="1.4" />
  </IconSvg>
);

/* ---------- 10 FOOD / STATION CATEGORY EMBLEMS ---------- */

export const JuicerStationIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path d="M19 4.5 L16 12" stroke="#EF4444" strokeWidth="2.6" strokeLinecap="round" />
    <circle cx="23" cy="11.5" r="4" fill="#FDE047" stroke={STROKE} strokeWidth="2" />
    <path d="M9.5 10.5 H22.5 L20.5 26.5 C20.4 27.3 19.7 27.8 18.8 27.8 H13.2 C12.3 27.8 11.6 27.3 11.5 26.5 Z" fill="#FDE047" stroke={STROKE} strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M10.4 15.5 H21.6 L20.4 25.8 H11.6 Z" fill="#FB923C" fillOpacity="0.65" />
    <path d="M12.2 13.2 L13 23.5" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeOpacity="0.78" />
  </IconSvg>
);

export const BlenderStationIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path d="M18.5 4 L16.5 11" stroke="#38BDF8" strokeWidth="2.6" strokeLinecap="round" />
    <path d="M9 13 C9 9 12.2 7.2 16 7.2 C19.8 7.2 23 9 23 13 Z" fill="#FFFBF0" stroke={STROKE} strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M9.5 13 H22.5 L20.4 27 H11.6 Z" fill="#F472B6" stroke={STROKE} strokeWidth="2.2" strokeLinejoin="round" />
    <circle cx="13.5" cy="24" r="1.4" fill={STROKE} />
    <circle cx="16.8" cy="24.5" r="1.4" fill={STROKE} />
    <circle cx="18.5" cy="22" r="1.3" fill={STROKE} />
    <path d="M12 15.5 L12.8 21.5" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeOpacity="0.72" />
  </IconSvg>
);

export const GrillStationIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path d="M23 18.5 H28.5" stroke={STROKE} strokeWidth="3.2" strokeLinecap="round" />
    <path d="M5 18 H23.5 C23.5 22.4 19.6 25 14.2 25 C8.8 25 5 22.4 5 18 Z" fill="#64748B" stroke={STROKE} strokeWidth="2.2" strokeLinejoin="round" />
    <ellipse cx="14.2" cy="16.2" rx="7.2" ry="3.8" fill="#B45309" stroke={STROKE} strokeWidth="2.1" />
    <path d="M10.5 15 L12.5 17.5 M14.2 14.5 L16 17.5 M17.5 15 L19 17" stroke={STROKE} strokeWidth="1.5" strokeLinecap="round" />
    <path d="M11 26.5 C12.5 24.5 15.5 24.5 17 26.5" stroke="#F97316" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M11 10 C10.4 8.2 12 7.2 11.4 5.5 M16.2 9.5 C15.6 7.7 17.2 6.7 16.6 5" stroke="#FB923C" strokeWidth="1.8" strokeLinecap="round" />
  </IconSvg>
);

export const FryerStationIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <rect x="9" y="6.5" width="3.5" height="12" rx="1.2" fill="#FDE047" stroke={STROKE} strokeWidth="1.8" />
    <rect x="13.5" y="4.8" width="3.8" height="14" rx="1.2" fill="#FACC15" stroke={STROKE} strokeWidth="1.8" />
    <rect x="18.2" y="6.8" width="3.8" height="12" rx="1.2" fill="#FDE047" stroke={STROKE} strokeWidth="1.8" />
    <path d="M7.5 14.5 C11.5 17 20.5 17 24.5 14.5 L22.5 27.5 H9.5 Z" fill="#EF4444" stroke={STROKE} strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M13 17 V26 M19 17 V26" stroke="#FFFBF0" strokeWidth="2.2" />
  </IconSvg>
);

export const WokStationIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path d="M23.5 15.5 L28.5 13" stroke={STROKE} strokeWidth="3" strokeLinecap="round" />
    <path d="M5.5 16.5 C5.5 23.2 10 26.5 15.5 26.5 C21 26.5 25 23.2 25 16.5 Z" fill="#57534E" stroke={STROKE} strokeWidth="2.3" strokeLinejoin="round" />
    <path d="M7.5 16.5 C9.5 12 21 12 23 16.5 Z" fill="#FBBF24" stroke={STROKE} strokeWidth="2" />
    <circle cx="12.5" cy="14.5" r="1.6" fill="#4ADE80" />
    <circle cx="17.8" cy="14.2" r="1.6" fill="#EF4444" />
    <path d="M12 9.5 C11.2 7.8 12.8 6.8 12 5.2 M17.5 9.2 C16.7 7.5 18.3 6.5 17.5 4.8" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
  </IconSvg>
);

export const OvenStationIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path d="M5.5 25.5 V17 C5.5 10.2 10.2 6 16 6 C21.8 6 26.5 10.2 26.5 17 V25.5 Z" fill="#EA580C" stroke={STROKE} strokeWidth="2.3" strokeLinejoin="round" />
    <path d="M10.5 25.5 V18.8 A5.5 5.5 0 0 1 21.5 18.8 V25.5 Z" fill="#FDE047" stroke={STROKE} strokeWidth="2.1" />
    <path d="M12.5 24.5 C13.5 20.5 18.5 20.5 19.5 24.5 Z" fill="#F97316" />
    <rect x="4.5" y="24.5" width="23" height="3.2" rx="1.4" fill="#7A553A" stroke={STROKE} strokeWidth="2" />
    <path d="M10 11.2 C11.5 9.6 13.8 8.8 16 8.8" stroke="#FDBA74" strokeWidth="1.8" strokeLinecap="round" />
  </IconSvg>
);

export const EspressoStationIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path d="M22.5 14 H25.2 C27 14 27.8 15.5 27.8 17.4 C27.8 19.3 26.6 20.8 24.8 20.8 H22" stroke={STROKE} strokeWidth="2.4" strokeLinecap="round" />
    <path d="M6.5 12 H22.5 V20.5 C22.5 24.4 19.5 26.8 14.5 26.8 C9.5 26.8 6.5 24.4 6.5 20.5 Z" fill="#FFFBF0" stroke={STROKE} strokeWidth="2.3" strokeLinejoin="round" />
    <rect x="7.5" y="16.5" width="14" height="4.2" fill="#FB923C" />
    <ellipse cx="14.5" cy="12" rx="8" ry="2.6" fill="#7A553A" stroke={STROKE} strokeWidth="2" />
    <path d="M11.5 7.8 C11 6.3 12.4 5.5 11.8 4.2 M16.8 7.5 C16.3 6 17.7 5.2 17.1 3.9" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
  </IconSvg>
);

export const CauldronStationIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path d="M20 5 L16 14" stroke="#B45309" strokeWidth="2.8" strokeLinecap="round" />
    <circle cx="16" cy="19.5" r="8.8" fill="#9333EA" stroke={STROKE} strokeWidth="2.3" />
    <ellipse cx="16" cy="13" rx="8.6" ry="3.1" fill="#4ADE80" stroke={STROKE} strokeWidth="2.1" />
    <circle cx="13" cy="12.5" r="1.4" fill="#FEF08A" />
    <circle cx="18.2" cy="13.2" r="1.2" fill="#FFFFFF" />
    <path d="M10.8 19.5 C11 21.8 12.2 23.6 13.8 24.5" stroke="#E9D5FF" strokeWidth="1.9" strokeLinecap="round" strokeOpacity="0.65" />
  </IconSvg>
);

export const SushiStationIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <rect x="4" y="21.5" width="24" height="4.5" rx="2" fill="#D9B88C" stroke={STROKE} strokeWidth="2.2" />
    <rect x="8.5" y="14.5" width="15" height="7.5" rx="3.4" fill="#FFFBF0" stroke={STROKE} strokeWidth="2.1" />
    <path d="M7.5 15.8 C7.5 11.2 11 9.5 16 9.5 C21 9.5 24.5 11.2 24.5 15.8 Z" fill="#FB7185" stroke={STROKE} strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M10.5 12.5 L12.5 14.8 M19 12 L21 14.5" stroke="#FFFBF0" strokeWidth="1.6" strokeLinecap="round" />
    <rect x="14" y="9.5" width="4" height="12.2" fill="#3D2314" />
  </IconSvg>
);

export const DessertStationIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path d="M8.5 17.5 H23.5 L21.4 26.8 H10.6 Z" fill="#FDE047" stroke={STROKE} strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M13 18 V26 M19 18 V26" stroke="#D97706" strokeWidth="1.6" />
    <path d="M7.2 17.5 C7.2 12.5 11 10 16 10 C21 10 24.8 12.5 24.8 17.5 Z" fill="#F472B6" stroke={STROKE} strokeWidth="2.2" strokeLinejoin="round" />
    <circle cx="16" cy="7.5" r="3" fill="#EF4444" stroke={STROKE} strokeWidth="2" />
    <circle cx="15.2" cy="6.6" r="0.9" fill="#FFFFFF" />
    <path d="M11 14.5 C12.2 13 14 12.5 15.8 12.5" stroke="#FFFFFF" strokeWidth="1.7" strokeLinecap="round" strokeOpacity="0.75" />
  </IconSvg>
);

export const StationStyleIcon: React.FC<CartoonIconProps & { styleKind: StationModelStyle }> = ({
  styleKind,
  ...rest
}) => {
  switch (styleKind) {
    case 'juicer':
      return <JuicerStationIcon {...rest} />;
    case 'blender':
      return <BlenderStationIcon {...rest} />;
    case 'grill':
      return <GrillStationIcon {...rest} />;
    case 'fryer':
      return <FryerStationIcon {...rest} />;
    case 'wok':
      return <WokStationIcon {...rest} />;
    case 'oven':
      return <OvenStationIcon {...rest} />;
    case 'espresso':
      return <EspressoStationIcon {...rest} />;
    case 'cauldron':
      return <CauldronStationIcon {...rest} />;
    case 'sushi':
      return <SushiStationIcon {...rest} />;
    case 'dessert':
      return <DessertStationIcon {...rest} />;
  }
};

/* ---------- GEAR SLOT GLOSSY CARTOON ICONS ---------- */

export const HeadGearIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path
      d="M8.5 18.5 C4.8 17.5 4.6 11.8 8.8 10.6 C10 6.2 13.8 4.8 16 6.5 C18.2 4.8 22 6.2 23.2 10.6 C27.4 11.8 27.2 17.5 23.5 18.5 Z"
      fill="#FFFBF0"
      stroke={STROKE}
      strokeWidth="2.3"
      strokeLinejoin="round"
    />
    <rect x="8" y="18" width="16" height="8" rx="2.5" fill="#FDE047" stroke={STROKE} strokeWidth="2.2" />
    <rect x="9" y="21.5" width="14" height="3.2" rx="1" fill="#F97316" />
    <circle cx="16" cy="21" r="2.2" fill="#38BDF8" stroke={STROKE} strokeWidth="1.5" />
    <ellipse cx="11.8" cy="10.2" rx="2.6" ry="1.3" transform="rotate(-22 11.8 10.2)" fill="#FFFFFF" />
  </IconSvg>
);

export const BodyGearIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path
      d="M11 6 H21 L27 11 L24 16 L21.5 14.5 V26.5 C21.5 27.3 20.8 27.8 20 27.8 H12 C11.2 27.8 10.5 27.3 10.5 26.5 V14.5 L8 16 L5 11 Z"
      fill="#FFFBF0"
      stroke={STROKE}
      strokeWidth="2.3"
      strokeLinejoin="round"
    />
    <path d="M12.5 6 L16 11.5 L19.5 6" fill="#FB923C" stroke={STROKE} strokeWidth="1.8" strokeLinejoin="round" />
    <circle cx="14" cy="15.5" r="1.2" fill={STROKE} />
    <circle cx="18" cy="15.5" r="1.2" fill={STROKE} />
    <circle cx="14" cy="19.5" r="1.2" fill={STROKE} />
    <circle cx="18" cy="19.5" r="1.2" fill={STROKE} />
    <rect x="11" y="22.5" width="10" height="4" rx="1.2" fill="#FDE047" stroke={STROKE} strokeWidth="1.5" />
  </IconSvg>
);

export const HandGearIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path d="M8 24.5 L18 14.5" stroke="#B45309" strokeWidth="4.2" strokeLinecap="round" />
    <path d="M8 24.5 L18 14.5" stroke={STROKE} strokeWidth="1.4" strokeLinecap="round" />
    <path
      d="M15.5 11.5 L22.2 4.8 C23.6 3.5 25.8 4.2 26.6 5.8 C27.5 7.5 27.2 9.8 25.6 11.4 L19.6 17.4 Z"
      fill="#E2E8F0"
      stroke={STROKE}
      strokeWidth="2.3"
      strokeLinejoin="round"
    />
    <path d="M19.5 10.2 L23.5 6.4" stroke="#FFFFFF" strokeWidth="1.9" strokeLinecap="round" />
    <circle cx="9.2" cy="23.2" r="2.5" fill="#FDE047" stroke={STROKE} strokeWidth="1.9" />
  </IconSvg>
);

export const RingGearIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <circle cx="16" cy="18.5" r="8.5" fill="none" stroke={STROKE} strokeWidth="5.4" />
    <circle cx="16" cy="18.5" r="8.5" fill="none" stroke="#FDE047" strokeWidth="2.8" />
    <polygon points="16,4.5 21.5,9.5 16,14 10.5,9.5" fill="#38BDF8" stroke={STROKE} strokeWidth="2.1" strokeLinejoin="round" />
    <polygon points="16,5.8 19.2,9.2 16,10.2 12.8,9.2" fill="#BAE6FD" />
  </IconSvg>
);

export const NecklaceGearIcon: React.FC<CartoonIconProps> = (props) => (
  <IconSvg {...props}>
    <path d="M7.5 7.5 C7.5 16.5 11.5 20 16 20 C20.5 20 24.5 16.5 24.5 7.5" stroke={STROKE} strokeWidth="4.2" strokeLinecap="round" />
    <path d="M7.5 7.5 C7.5 16.5 11.5 20 16 20 C20.5 20 24.5 16.5 24.5 7.5" stroke="#FDE047" strokeWidth="2.1" strokeLinecap="round" />
    <circle cx="16" cy="23" r="5" fill="#F472B6" stroke={STROKE} strokeWidth="2.2" />
    <circle cx="14.5" cy="21.5" r="1.5" fill="#FFFFFF" fillOpacity="0.82" />
  </IconSvg>
);

export const GearSlotIcon: React.FC<CartoonIconProps & { slot: GearSlot | EquippedSlotKey }> = ({
  slot,
  ...rest
}) => {
  switch (slot) {
    case 'head':
      return <HeadGearIcon {...rest} />;
    case 'body':
      return <BodyGearIcon {...rest} />;
    case 'ring':
      return <RingGearIcon {...rest} />;
    case 'necklace':
      return <NecklaceGearIcon {...rest} />;
    case 'hand':
    case 'hand1':
    case 'hand2':
      return <HandGearIcon {...rest} />;
  }
};

/* ---------- COMPANION PET SPECIES PORTRAITS (ALL 14 STYLES) ---------- */

export type PetModelStyle = PetSpeciesTemplate['modelStyle'];

export const PetSpeciesIcon: React.FC<CartoonIconProps & { styleKind: PetModelStyle }> = ({
  styleKind,
  ...props
}) => {
  switch (styleKind) {
    case 'chick':
      return (
        <IconSvg {...props}>
          <path d="M14 6 C14.5 4 16.5 3.8 17.5 5.5 C19 4.5 20.2 6 19 7.5" fill="#F97316" stroke={STROKE} strokeWidth="1.9" strokeLinecap="round" />
          <circle cx="16" cy="17.5" r="9.8" fill="#FDE047" stroke={STROKE} strokeWidth="2.3" />
          <circle cx="12.5" cy="16" r="1.6" fill={STROKE} />
          <circle cx="19.5" cy="16" r="1.6" fill={STROKE} />
          <circle cx="12" cy="15.3" r="0.6" fill="#FFFFFF" />
          <circle cx="19" cy="15.3" r="0.6" fill="#FFFFFF" />
          <polygon points="16,17.2 18.8,19.4 16,21.5 13.2,19.4" fill="#F97316" stroke={STROKE} strokeWidth="1.6" strokeLinejoin="round" />
          <ellipse cx="10.2" cy="19.2" rx="1.8" ry="1.1" fill="#FB7185" fillOpacity="0.6" />
          <ellipse cx="21.8" cy="19.2" rx="1.8" ry="1.1" fill="#FB7185" fillOpacity="0.6" />
        </IconSvg>
      );
    case 'pup':
      return (
        <IconSvg {...props}>
          <ellipse cx="8.5" cy="13.5" rx="3.5" ry="6.2" transform="rotate(14 8.5 13.5)" fill="#D97706" stroke={STROKE} strokeWidth="2.1" />
          <ellipse cx="23.5" cy="13.5" rx="3.5" ry="6.2" transform="rotate(-14 23.5 13.5)" fill="#D97706" stroke={STROKE} strokeWidth="2.1" />
          <circle cx="16" cy="17" r="9.2" fill="#F59E0B" stroke={STROKE} strokeWidth="2.3" />
          <ellipse cx="16" cy="20.2" rx="5.2" ry="3.8" fill="#FFFBF0" />
          <circle cx="12.5" cy="15.5" r="1.6" fill={STROKE} />
          <circle cx="19.5" cy="15.5" r="1.6" fill={STROKE} />
          <ellipse cx="16" cy="18.6" rx="2.2" ry="1.5" fill={STROKE} />
          <path d="M14.2 21.6 C15 22.8 17 22.8 17.8 21.6" stroke="#FB7185" strokeWidth="2" strokeLinecap="round" />
        </IconSvg>
      );
    case 'kitten':
      return (
        <IconSvg {...props}>
          <polygon points="7.5,14 9.5,6 14.5,10.5" fill="#FB923C" stroke={STROKE} strokeWidth="2.1" strokeLinejoin="round" />
          <polygon points="24.5,14 22.5,6 17.5,10.5" fill="#FB923C" stroke={STROKE} strokeWidth="2.1" strokeLinejoin="round" />
          <circle cx="16" cy="18" r="9" fill="#FDBA74" stroke={STROKE} strokeWidth="2.3" />
          <path d="M14 10 V13 M16 9.5 V13.2 M18 10 V13" stroke="#EA580C" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="12.5" cy="17" r="1.6" fill={STROKE} />
          <circle cx="19.5" cy="17" r="1.6" fill={STROKE} />
          <polygon points="16,18.8 17.6,20.4 14.4,20.4" fill="#F472B6" />
          <path d="M6.5 18.5 H10 M6.5 21 H10 M22 18.5 H25.5 M22 21 H25.5" stroke={STROKE} strokeWidth="1.4" strokeLinecap="round" />
        </IconSvg>
      );
    case 'pony':
      return (
        <IconSvg {...props}>
          <polygon points="10,12 11,5.5 15,9.5" fill="#B45309" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
          <polygon points="22,12 21,5.5 17,9.5" fill="#B45309" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
          <rect x="8.5" y="9.5" width="15" height="17" rx="7" fill="#D97706" stroke={STROKE} strokeWidth="2.3" />
          <rect x="10.5" y="18.5" width="11" height="7.2" rx="3.5" fill="#FDE68A" stroke={STROKE} strokeWidth="1.6" />
          <path d="M14.5 9.5 C15 12 17 12.8 18 10" stroke="#FDE047" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="12.6" cy="15.2" r="1.5" fill={STROKE} />
          <circle cx="19.4" cy="15.2" r="1.5" fill={STROKE} />
          <circle cx="13.8" cy="21.8" r="1.1" fill={STROKE} />
          <circle cx="18.2" cy="21.8" r="1.1" fill={STROKE} />
        </IconSvg>
      );
    case 'turtle':
      return (
        <IconSvg {...props}>
          <path d="M6 21 C6 12.5 10.5 8 16 8 C21.5 8 26 12.5 26 21 Z" fill="#16A34A" stroke={STROKE} strokeWidth="2.3" strokeLinejoin="round" />
          <polygon points="16,10.5 20.5,14 19,18.8 13,18.8 11.5,14" fill="#4ADE80" stroke={STROKE} strokeWidth="1.6" strokeLinejoin="round" />
          <rect x="5" y="20" width="22" height="4.5" rx="2.2" fill="#FDE047" stroke={STROKE} strokeWidth="2" />
          <circle cx="24.5" cy="18" r="3.6" fill="#4ADE80" stroke={STROKE} strokeWidth="2" />
          <circle cx="25.5" cy="17.2" r="1" fill={STROKE} />
        </IconSvg>
      );
    case 'penguin':
      return (
        <IconSvg {...props}>
          <ellipse cx="16" cy="17" rx="9.5" ry="10.5" fill="#475569" stroke={STROKE} strokeWidth="2.3" />
          <ellipse cx="16" cy="19.2" rx="6.5" ry="7.4" fill="#FFFBF0" />
          <circle cx="12.4" cy="14.6" r="1.6" fill={STROKE} />
          <circle cx="19.6" cy="14.6" r="1.6" fill={STROKE} />
          <polygon points="16,15.8 19.2,18 16,20.2 12.8,18" fill="#FB923C" stroke={STROKE} strokeWidth="1.6" strokeLinejoin="round" />
        </IconSvg>
      );
    case 'bot':
      return (
        <IconSvg {...props}>
          <line x1="16" y1="5" x2="16" y2="9.5" stroke={STROKE} strokeWidth="2.3" strokeLinecap="round" />
          <circle cx="16" cy="4.8" r="2.2" fill="#FDE047" stroke={STROKE} strokeWidth="1.8" />
          <rect x="6" y="9.5" width="20" height="16.5" rx="5" fill="#38BDF8" stroke={STROKE} strokeWidth="2.3" />
          <rect x="9" y="13" width="14" height="7" rx="3" fill="#FFFBF0" stroke={STROKE} strokeWidth="1.8" />
          <circle cx="13" cy="16.5" r="1.7" fill="#0284C7" />
          <circle cx="19" cy="16.5" r="1.7" fill="#0284C7" />
          <path d="M12.5 22.8 H19.5" stroke={STROKE} strokeWidth="2" strokeLinecap="round" />
        </IconSvg>
      );
    case 'lucky_cat':
      return (
        <IconSvg {...props}>
          <polygon points="7.5,14 9.5,5.8 14.5,10" fill="#FDE047" stroke={STROKE} strokeWidth="2.1" strokeLinejoin="round" />
          <polygon points="24.5,14 22.5,5.8 17.5,10" fill="#FDE047" stroke={STROKE} strokeWidth="2.1" strokeLinejoin="round" />
          <circle cx="16" cy="17.5" r="9.2" fill="#FDE047" stroke={STROKE} strokeWidth="2.3" />
          <path d="M10.8 16.5 Q12.5 14.5 14.2 16.5 M17.8 16.5 Q19.5 14.5 21.2 16.5" stroke={STROKE} strokeWidth="2" strokeLinecap="round" />
          <rect x="9.5" y="23.2" width="13" height="3.2" rx="1.6" fill="#EF4444" stroke={STROKE} strokeWidth="1.6" />
          <circle cx="16" cy="24.8" r="2" fill="#FDE047" stroke={STROKE} strokeWidth="1.5" />
        </IconSvg>
      );
    case 'panda':
      return (
        <IconSvg {...props}>
          <circle cx="9" cy="9.5" r="3.6" fill={STROKE} />
          <circle cx="23" cy="9.5" r="3.6" fill={STROKE} />
          <circle cx="16" cy="17.5" r="9.5" fill="#FFFBF0" stroke={STROKE} strokeWidth="2.3" />
          <ellipse cx="12" cy="16.5" rx="2.9" ry="3.4" transform="rotate(-14 12 16.5)" fill={STROKE} />
          <ellipse cx="20" cy="16.5" rx="2.9" ry="3.4" transform="rotate(14 20 16.5)" fill={STROKE} />
          <circle cx="12.2" cy="15.8" r="1.1" fill="#FFFFFF" />
          <circle cx="19.8" cy="15.8" r="1.1" fill="#FFFFFF" />
          <ellipse cx="16" cy="19.8" rx="2.1" ry="1.4" fill={STROKE} />
        </IconSvg>
      );
    case 'red_fox':
      return (
        <IconSvg {...props}>
          <polygon points="7,14 9,5.5 14.5,10" fill="#EA580C" stroke={STROKE} strokeWidth="2.1" strokeLinejoin="round" />
          <polygon points="25,14 23,5.5 17.5,10" fill="#EA580C" stroke={STROKE} strokeWidth="2.1" strokeLinejoin="round" />
          <ellipse cx="16" cy="17.8" rx="10" ry="8.8" fill="#EA580C" stroke={STROKE} strokeWidth="2.3" />
          <ellipse cx="10.8" cy="19.5" rx="3.4" ry="2.6" fill="#FFFBF0" />
          <ellipse cx="21.2" cy="19.5" rx="3.4" ry="2.6" fill="#FFFBF0" />
          <circle cx="12.5" cy="16.2" r="1.5" fill={STROKE} />
          <circle cx="19.5" cy="16.2" r="1.5" fill={STROKE} />
          <ellipse cx="16" cy="19.5" rx="2" ry="1.4" fill={STROKE} />
        </IconSvg>
      );
    case 'dragon':
      return (
        <IconSvg {...props}>
          <polygon points="8.5,11 6.5,4.8 13,8.5" fill="#FDE047" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
          <polygon points="23.5,11 25.5,4.8 19,8.5" fill="#FDE047" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
          <circle cx="16" cy="17.5" r="9.4" fill="#EF4444" stroke={STROKE} strokeWidth="2.3" />
          <ellipse cx="16" cy="21" rx="6.2" ry="3.8" fill="#FDE047" stroke={STROKE} strokeWidth="1.6" />
          <circle cx="12.4" cy="15.2" r="1.7" fill="#FEF08A" stroke={STROKE} strokeWidth="1.4" />
          <circle cx="19.6" cy="15.2" r="1.7" fill="#FEF08A" stroke={STROKE} strokeWidth="1.4" />
          <circle cx="13.8" cy="20.8" r="1" fill={STROKE} />
          <circle cx="18.2" cy="20.8" r="1" fill={STROKE} />
        </IconSvg>
      );
    case 'kraken':
      return (
        <IconSvg {...props}>
          <path d="M7.5 18 C7.5 10.5 11.2 6.5 16 6.5 C20.8 6.5 24.5 10.5 24.5 18 C24.5 21 22.8 22.5 20.5 22.5 H11.5 C9.2 22.5 7.5 21 7.5 18 Z" fill="#EC4899" stroke={STROKE} strokeWidth="2.3" />
          <path d="M9.5 22.5 C8.5 25.5 7 26.5 6.5 26 M14 22.5 V26.5 M18 22.5 V26.5 M22.5 22.5 C23.5 25.5 25 26.5 25.5 26" stroke={STROKE} strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="12.6" cy="15.8" r="2.2" fill="#FFFBF0" stroke={STROKE} strokeWidth="1.5" />
          <circle cx="19.4" cy="15.8" r="2.2" fill="#FFFBF0" stroke={STROKE} strokeWidth="1.5" />
          <circle cx="12.8" cy="15.8" r="1" fill={STROKE} />
          <circle cx="19.2" cy="15.8" r="1" fill={STROKE} />
        </IconSvg>
      );
    case 'mole':
      return (
        <IconSvg {...props}>
          <path d="M7 24 V16 C7 10.5 11 7 16 7 C21 7 25 10.5 25 16 V24 Z" fill="#78716C" stroke={STROKE} strokeWidth="2.3" strokeLinejoin="round" />
          <rect x="9.5" y="12.5" width="13" height="4.5" rx="2.2" fill="#FDE047" stroke={STROKE} strokeWidth="1.8" />
          <ellipse cx="16" cy="20.5" rx="3.4" ry="2.2" fill="#F472B6" stroke={STROKE} strokeWidth="1.6" />
        </IconSvg>
      );
    case 'gnome':
    default:
      return (
        <IconSvg {...props}>
          <polygon points="16,4.5 24,16 8,16" fill="#EF4444" stroke={STROKE} strokeWidth="2.2" strokeLinejoin="round" />
          <circle cx="16" cy="20" r="7.5" fill="#FFFBF0" stroke={STROKE} strokeWidth="2.2" />
          <ellipse cx="16" cy="18.2" rx="2.6" ry="2" fill="#FDBA74" stroke={STROKE} strokeWidth="1.6" />
        </IconSvg>
      );
  }
};

