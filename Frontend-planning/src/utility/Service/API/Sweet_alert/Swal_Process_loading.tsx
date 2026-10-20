import Swal from "sweetalert2";

const Swal_Process_loading = (options?: {
  title?: string;
  message?: string;
  icon?: string;
}) => {
  const {
    title = "กำลังดำเนินการ",
    message = "กรุณารอสักครู่ ระบบกำลังประมวลผลข้อมูลของคุณ",
    icon = "⚡",
  } = options || {};

  return Swal.fire({
    html: `
      <div class="text-center space-y-6 py-6">
        <!-- Loading Animation -->
        <div class="flex justify-center">
          <div class="relative">
            <!-- Outer Ring -->
            <div class="w-20 h-20 border-4 border-primary/20 rounded-full animate-spin border-t-primary"></div>
            
            <!-- Inner Ring -->
            <div class="absolute inset-2 w-16 h-16 border-3 border-secondary/30 rounded-full animate-spin border-b-secondary" style="animation-direction: reverse; animation-duration: 1.5s;"></div>
            
            <!-- Center Icon -->
            <div class="absolute inset-0 flex items-center justify-center">
              <div class="text-2xl animate-pulse">${icon}</div>
            </div>
          </div>
        </div>

        <!-- Loading Content -->
        <div class="space-y-3">
          <h3 class="text-xl font-bold text-base-content">
            ${title}
          </h3>
          <p class="text-base-content/70 text-sm max-w-xs mx-auto leading-relaxed">
            ${message}
          </p>
        </div>


        <!-- Status Card -->
        <div class="bg-base-100 border border-base-300 rounded-lg p-4 max-w-sm mx-auto">
          <div class="flex items-center justify-center gap-3">
            <div class="w-2 h-2 bg-success rounded-full animate-pulse"></div>
            <span class="text-sm text-base-content/60 font-medium">
              กำลังเชื่อมต่อกับเซิร์ฟเวอร์...
            </span>
          </div>
        </div>
      </div>

      <style>
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        
        .animate-spin-slow {
          animation: spin 3s linear infinite;
        }
      </style>
    `,
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    customClass: {
      popup: "swal2-popup !bg-base-200 !border-base-300 !shadow-2xl",
      htmlContainer: "!text-base-content !p-0",
    },
    width: "450px",
    padding: "2rem",
    backdrop: `
      rgba(0,0,0,0.5)
      url("data:image/svg+xml,%3csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3e%3cg fill='none' fill-rule='evenodd'%3e%3cg fill='%23ffffff' fill-opacity='0.1'%3e%3ccircle cx='30' cy='30' r='4'/%3e%3c/g%3e%3c/g%3e%3c/svg%3e")
      left top
      repeat
    `,
    didOpen: () => {
      const popup = Swal.getPopup();
      if (popup) {
        popup.style.animation =
          "swal2-show 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)";

        // เพิ่ม dynamic text animation
        setTimeout(() => {
          const statusText = popup.querySelector(".text-base-content\\/60");
          if (statusText) {
            const messages = ["...Loading..."];
            let index = 0;
            const interval = setInterval(() => {
              if (Swal.isVisible()) {
                statusText.textContent = messages[index % messages.length];
                index++;
              } else {
                clearInterval(interval);
              }
            }, 2000);
          }
        }, 1000);
      }
    },
  });
};

export default Swal_Process_loading;
