import { useLocation, Link } from "react-router-dom";
import { useState, useEffect } from "react";

interface DrawerMenuFlatProps {
  isOpen: boolean;
  title?: string;
  iconPaths?: { img: string }[];
  links: {
    path: string;
    element: React.ReactNode;
    label?: string;
    Title?: string;
    isDefault?: boolean;
    icon: any;
  }[];
  closeDrawer?: () => void;
  toggleDrawer?: () => void;
}

const DrawerMenuFlat = ({
  isOpen,
  title,
  iconPaths = [],
  links,
  closeDrawer,
}: // toggleDrawer,
DrawerMenuFlatProps) => {
  const location = useLocation();
  const [currentPath, setCurrentPath] = useState(location.pathname);

  useEffect(() => {
    setCurrentPath(location.pathname);
  }, [location.pathname]);

  return (
    <div className="w-full">
      {/* Header Optional */}
      {title && isOpen && (
        <div
          className={`flex items-center p-2 rounded-lg select-none ${
            isOpen ? "justify-start" : "justify-center"
          }`}
        >
          {iconPaths.map((path, index) => (
            <img
              key={index}
              src={path.img}
              alt="icon"
              width={26}
              height={26}
              className="object-contain"
            />
          ))}
          <span className="font-bold text-sm ml-2 text-base-content/80">
            {title}
          </span>
        </div>
      )}

      {/* Flat Menu List */}
      <ul
        className={`flex flex-col gap-1 transition-all duration-300 ease-in-out ${
          isOpen ? "px-0" : "px-0"
        }`}
      >
        {links.map((link, index) => {
          const isActive = currentPath === link.path;

          return (
            <li key={index}>
              <Link
                to={link.path}
                onClick={closeDrawer}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 text-nowrap
                  ${
                    isActive
                      ? "bg-primary text-primary-content shadow-sm"
                      : "hover:bg-base-300 text-base-content/80"
                  }
                  ${!isOpen ? "justify-center" : "justify-start"}
                `}
              >
                {/* 🔹 Icon */}
                {link.icon && (
                  <img
                    src={link.icon}
                    alt="menu icon"
                    width={24}
                    height={24}
                    className={`object-contain transition-all duration-200 ${
                      isActive ? "scale-110" : ""
                    }`}
                  />
                )}

                {/* 🔹 Label */}
                {isOpen && (
                  <span
                    className={`text-sm transition-all ${
                      isActive
                        ? "font-bold opacity-100"
                        : "font-normal opacity-80"
                    }`}
                  >
                    {link.label}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default DrawerMenuFlat;
