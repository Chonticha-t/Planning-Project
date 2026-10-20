import React, { useState, useEffect, useMemo } from "react";
import { useLocation, Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";

interface LinkItem {
  path?: string;
  element?: React.ReactNode;
  label?: string;
  Title?: string;
  isDefault?: boolean;
  icon?: any;
  subLinks?: LinkItem[];
  labelClassName?: string;
}

interface DrawerMenuGroupProps {
  isOpen: boolean;
  title: string;
  icon?: any; // Single icon (Lucide component or image URL)
  iconPaths?: { img: string }[]; // Deprecated but kept for compatibility
  links: LinkItem[];
  closeDrawer?: () => void;
  toggleDrawer?: () => void;
}

// Helper function to render either PNG image paths or Lucide React components
const renderIcon = (icon: any, size = 20) => {
  if (!icon) return null;
  if (typeof icon === "string") {
    return (
      <img
        src={icon}
        alt="icon"
        width={size}
        height={size}
        className="object-contain shrink-0"
      />
    );
  }
  // Render Lucide Component directly
  const IconComponent = icon;
  return <IconComponent size={size} className="shrink-0" />;
};

// SubGroup component to render nested collapsible menus
const SubGroup = ({ 
  link, 
  isOpen, 
  closeDrawer 
}: { 
  link: LinkItem; 
  isOpen: boolean; 
  closeDrawer?: () => void 
}) => {
  const location = useLocation();
  const [currentPath, setCurrentPath] = useState(location.pathname);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setCurrentPath(location.pathname);
  }, [location.pathname]);

  // Automatically expand the sub-group if any nested link is active
  const hasActiveSublink = link.subLinks?.some(sub => sub.path === currentPath);
  useEffect(() => {
    if (hasActiveSublink && isOpen) {
      setExpanded(true);
    }
  }, [hasActiveSublink, isOpen]);

  // Collapse if drawer closes
  useEffect(() => {
    if (!isOpen) {
      setExpanded(false);
    }
  }, [isOpen]);

  return (
    <div className="w-full flex flex-col gap-0.5">
      <div 
        onClick={() => setExpanded(prev => !prev)}
        className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer hover:bg-base-300 active:scale-95 transition-all duration-200 select-none ${
          expanded ? "bg-base-200/50" : ""
        }`}
      >
        <div className="flex items-center gap-3">
          {link.icon && renderIcon(link.icon, 20)}
          {isOpen && <span className={`font-semibold opacity-90 ${link.labelClassName || "text-sm"}`}>{link.label}</span>}
        </div>
        {isOpen && (
          <ChevronDown 
            size={14} 
            className={`transition-transform duration-200 text-base-content/60 ${expanded ? "rotate-180" : ""}`} 
          />
        )}
      </div>

      {expanded && (
        <ul className="ml-4 mt-1 flex flex-col gap-1 border-l border-base-300 pl-3">
          {link.subLinks?.map((sub, index) => {
            const isActive = currentPath === sub.path;
            return (
              <li key={index}>
                <Link
                  to={sub.path || "#"}
                  onClick={closeDrawer}
                  className={`flex items-center gap-3 px-2 py-1.5 rounded-lg active:scale-95 transition-all duration-200 ${
                    isActive
                      ? "bg-primary text-primary-content font-bold shadow-sm"
                      : "hover:bg-base-300 text-base-content/85"
                  }`}
                >
                  {sub.icon && renderIcon(sub.icon, 18)}
                  {isOpen && (
                    <span 
                      className={`transition-all duration-200 whitespace-nowrap overflow-hidden text-ellipsis ${
                        sub.label && sub.label.length > 18 ? "text-[11px]" : "text-xs"
                      }`}
                      title={sub.label}
                    >
                      {sub.label}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

const DrawerMenuGroup = ({
  isOpen,
  title,
  icon,
  iconPaths,
  links,
  closeDrawer,
  toggleDrawer,
}: DrawerMenuGroupProps) => {
  const location = useLocation();
  const [currentPath, setCurrentPath] = useState(location.pathname);
  const [expanded, setExpanded] = useState(false);
  const hasLinks = links.length > 0;

  useEffect(() => {
    setCurrentPath(location.pathname);
  }, [location.pathname]);

  // Check if any link or subLink is active to auto-expand the top-level group
  const hasActiveLink = useMemo(() => {
    return links.some(link => {
      if (link.path === currentPath) return true;
      if (link.subLinks?.some(sub => sub.path === currentPath)) return true;
      return false;
    });
  }, [links, currentPath]);

  useEffect(() => {
    if (hasActiveLink && isOpen) {
      setExpanded(true);
    }
  }, [hasActiveLink, isOpen]);

  useEffect(() => {
    if (!isOpen) setExpanded(false);
  }, [isOpen]);

  const toggleExpand = () => setExpanded((prev) => !prev);

  const handleClick = () => {
    if (!hasLinks) return;
    if (!isOpen && toggleDrawer) {
      toggleDrawer();
      setTimeout(() => setExpanded(true), 250);
    } else {
      toggleExpand();
    }
  };

  return (
    <div className="w-full">
      {/* Header Group */}
      <div
        onClick={handleClick}
        className={`flex items-center p-2 rounded-lg cursor-pointer hover:bg-base-300 active:scale-95 transition-all duration-200 justify-between text-nowrap ${
          expanded ? "bg-base-300 font-bold" : ""
        }`}
      >
        <div
          className={`flex items-center gap-3 ${
            isOpen ? "justify-start" : "justify-center w-full"
          }`}
        >
          {icon ? (
            renderIcon(icon, 24)
          ) : iconPaths ? (
            iconPaths.map((path, index) => (
              <img
                key={index}
                src={path.img}
                alt="icon"
                width={24}
                height={24}
                className="object-contain"
              />
            ))
          ) : null}
          {isOpen && <span className="font-bold text-sm">{title}</span>}
        </div>

        {isOpen && hasLinks && (
          <ChevronDown
            size={16}
            className={`transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
          />
        )}
      </div>

      {/* Sub-menu */}
      {expanded && hasLinks && (
        <ul className="ml-5 mt-1 flex flex-col gap-1 transition-all duration-300 ease-in-out">
          {links.map((link, index) => {
            // If the item contains subLinks, render it as collapsible
            if (link.subLinks && link.subLinks.length > 0) {
              return (
                <li key={index}>
                  <SubGroup link={link} isOpen={isOpen} closeDrawer={closeDrawer} />
                </li>
              );
            }

            const isActive = currentPath === link.path;
            return (
              <li key={index}>
                <Link
                  to={link.path || "#"}
                  onClick={closeDrawer}
                  className={`flex items-center gap-3 px-2 py-1.5 rounded-lg active:scale-95 transition-all duration-200 ${
                    isActive
                      ? "bg-primary text-primary-content font-bold shadow-sm"
                      : "hover:bg-base-300 text-base-content/85"
                  }`}
                >
                  {link.icon && renderIcon(link.icon, 20)}

                  {isOpen && (
                    <span
                      className={`transition-all whitespace-nowrap overflow-hidden text-ellipsis ${
                        isActive
                          ? "font-bold opacity-100"
                          : "font-normal opacity-80"
                      } ${link.label && link.label.length > 18 ? "text-xs" : "text-sm"}`}
                      title={link.label}
                    >
                      {link.label}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default DrawerMenuGroup;
