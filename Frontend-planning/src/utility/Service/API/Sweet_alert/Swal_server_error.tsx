import Swal from "sweetalert2";

interface ServerErrorOptions {
  error: any;
  title?: string;
  showActionRequired?: boolean;
}

const SwalServerError = async (options: ServerErrorOptions) => {
  const { error, title, showActionRequired = true } = options;

  const errorTitle = title || error.response?.data?.status || "Server Error";

  return await Swal.fire({
    title: errorTitle,
    html: `
      <div class="text-left space-y-4">
        <!-- Error Status -->
        <div class="bg-error/10 border border-error/20 rounded-lg p-4">
          <div class="flex items-center gap-2 mb-2">
            <div class="w-2 h-2 bg-error rounded-full"></div>
            <span class="font-semibold text-error">Server Error</span>
          </div>
          <p class="text-sm text-base-content/80 mb-3">
            ${
              error.response?.data?.message || "An error occurred on the server"
            }
          </p>
          
          <!-- Error Details -->
          <div class="bg-base-100 rounded p-3 space-y-2">
            <div class="flex justify-between items-center text-sm">
              <span class="text-base-content/70">Status Code:</span>
              <span class="badge badge-error badge-sm">
                ${error.response?.status || "Unknown"}
              </span>
            </div>
            <div class="flex justify-between items-center text-sm">
              <span class="text-base-content/70">Error Type:</span>
              <span class="font-mono text-xs bg-base-200 px-2 py-1 rounded">
                ${error.response?.data?.status || "Server Error"}
              </span>
            </div>
          </div>
        </div>

        ${
          showActionRequired
            ? `
          <!-- Action Required -->
          <div class="bg-warning/10 border border-warning/20 rounded-lg p-4">
            <div class="flex items-center gap-2 mb-2">
              <div class="w-2 h-2 bg-warning rounded-full"></div>
              <span class="font-semibold text-warning">What to do next?</span>
            </div>
            <ul class="text-sm text-base-content/70 space-y-1 list-disc list-inside">
              <li>Check if the job record still exists</li>
              <li>Verify your permissions</li>
              <li>Try again or contact administrator</li>
            </ul>
          </div>
        `
            : ""
        }
      </div>
    `,
    icon: "error",
    confirmButtonText: "Understood",
    confirmButtonColor: "#ef4444",
    customClass: {
      popup: "swal2-popup",
      confirmButton: "swal2-confirm",
    },
    width: "500px",
  });
};

export default SwalServerError;
