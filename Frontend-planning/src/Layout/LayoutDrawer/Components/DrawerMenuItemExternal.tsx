interface DrawerMenuItemExternalProps {
  icon: any; // icon เป็น path รูปภาพ หรือ Lucide icon component
  label: string; // ชื่อเมนู
  href: string; // ลิงก์ไปหน้าใหม่ (external หรือ reload)
  isOpen: boolean; // ใช้ควบคุม mini drawer
  newTab?: boolean; // เปิดในแท็บใหม่?
}

const renderIcon = (icon: any, size = 24) => {
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
  const IconComponent = icon;
  return <IconComponent size={size} className="shrink-0" />;
};

const DrawerMenuItemExternal = ({
  icon,
  label,
  href,
  isOpen,
  newTab = false,
}: DrawerMenuItemExternalProps) => {
  return (
    <a
      href={href}
      target={newTab ? "_blank" : "_self"}
      rel={newTab ? "noopener noreferrer" : undefined}
      className={`flex items-center p-2 rounded-lg cursor-pointer transition-colors duration-200
        \${isOpen ? "gap-3 justify-start" : "justify-center"}
        hover:bg-base-300`}
    >
      {renderIcon(icon, 24)}
      {isOpen && <span className="font-bold text-sm">{label}</span>}
    </a>
  );
};

export default DrawerMenuItemExternal;

//   {/* ไปหน้าใหม่ในแท็บเดียวกัน */}
//       <DrawerMenuItemExternal
//         icon={production_app}
//         label="Go to External"
//         href="https://www.google.com"
//         isOpen={isOpen}
//       />

//       {/* ไปหน้าใหม่ในแท็บใหม่ */}
//       <DrawerMenuItemExternal
//         icon={production_app}
//         label="Open Docs"
//         href="https://mui.com/"
//         isOpen={isOpen}
//         newTab
//       />
