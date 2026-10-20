import Swal from "sweetalert2";

interface NetworkErrorOptions {
  error: any;
  title?: string;
  showTroubleshooting?: boolean;
}

const SwalNetworkError = async (options: NetworkErrorOptions) => {
  const {
    error,
    title = "🌐 Connection Error",
    showTroubleshooting = true,
  } = options;

  return await Swal.fire({
    title,
    html: `
      <div class="text-left space-y-4">
        <!-- Connection Issue -->
        <div class="bg-error/10 border border-error/20 rounded-lg p-4">
          <div class="flex items-center gap-2 mb-2">
            <div class="w-2 h-2 bg-error rounded-full"></div>
            <span class="font-semibold text-error">Network Problem</span>
          </div>
          <p class="text-sm text-base-content/80 mb-3">Unable to connect to the server</p>
          
          <!-- Error Details -->
          <div class="bg-base-100 rounded p-3">
            <div class="text-sm">
              <span class="text-base-content/70">Error Message:</span>
              <div class="font-mono text-xs bg-base-200 px-2 py-1 rounded mt-1">
                ${error.message || "Unknown network error"}
              </div>
            </div>
          </div>
        </div>

        ${
          showTroubleshooting
            ? `
          <!-- Troubleshooting -->
          <div class="bg-info/10 border border-info/20 rounded-lg p-4">
            <div class="flex items-center gap-2 mb-2">
              <div class="w-2 h-2 bg-info rounded-full"></div>
              <span class="font-semibold text-info">Troubleshooting</span>
            </div>
            <ul class="text-sm text-base-content/70 space-y-1 list-disc list-inside">
              <li>Check your internet connection</li>
              <li>Verify server is running</li>
              <li>Try refreshing the page</li>
              <li>Contact IT support if problem persists</li>
            </ul>
          </div>
        `
            : ""
        }
      </div>
    `,
    icon: "error",
    confirmButtonText: "Try Again",
    confirmButtonColor: "#ef4444",
    customClass: {
      popup: "swal2-popup",
      confirmButton: "swal2-confirm",
    },
    width: "500px",
  });
};

export default SwalNetworkError;
