import { motion } from "motion/react";

interface propstype {
  text: string; // ข้อความที่ต้องการแสดงผล
}

const LogoText = ({ text }: propstype) => {
  return (
    <div className="flex]">
      {text.split("").map((char, index) => (
        <motion.span
          key={index}
          initial={{
            scale: 1,
            rotate: 0,
          }}
          whileHover={{
            y: -3, // เด้งขึ้นเล็กน้อย
            scale: 1.1, // ขยายเบา ๆ
            rotate: [25, 0],
            transition: { type: "spring", stiffness: 400, damping: 10 },
          }}
          className="tracking-wide text-xl font-bold inline-block cursor-default select-none"
        >
          {char === " " ? "\u00A0" : char}
        </motion.span>
      ))}
    </div>
  );
};

export default LogoText;
