export const apiRoutes = {
  health: {
    get: {
      pattern: "/api/health",
    },
  },

  auth: {
    get: {
      me: {
        pattern: "/api/auth/me",
      },

      history: {
        pattern: "/api/me/jigsaw-history",
      },
    },

    post: {
      telegram: {
        webapp: {
          pattern: "/api/auth/telegram-webapp",
        },

        widget: {
          pattern: "/api/auth/telegram-widget",
        },
      },

      devLogin: {
        pattern: "/api/auth/dev-login",
      },

      logout: {
        pattern: "/api/auth/logout",
      },
    },
  },

  compositions: {
    get: {
      me: {
        pattern: "/api/me/compositions",
      },

      layout: {
        pattern: "/api/compositions/:compositionId/layout",
        build: (compositionId: string) =>
          `/api/compositions/${encodeURIComponent(compositionId)}/layout`,
      },

      image: {
        pattern: "/api/compositions/:compositionId/images/:fileId",
        build: (compositionId: string, fileId: string) =>
          `/api/compositions/${encodeURIComponent(
            compositionId
          )}/images/${encodeURIComponent(fileId)}`,
      },

      rendered: {
        pattern: "/api/compositions/:compositionId/rendered",
        build: (compositionId: string) =>
          `/api/compositions/${encodeURIComponent(compositionId)}/rendered`,
      },
    },

    patch: {
      layout: {
        pattern: "/api/compositions/:compositionId/layout",
        build: (compositionId: string) =>
          `/api/compositions/${encodeURIComponent(compositionId)}/layout`,
      },
    },

    post: {
      render: {
        pattern: "/api/compositions/:compositionId/render",
        build: (compositionId: string) =>
          `/api/compositions/${encodeURIComponent(compositionId)}/render`,
      },
    },
  },

  sessions: {
    post: {
      pattern: "/api/sessions",
    },

    get: {
      current: {
        pattern: "/api/sessions/current",
      },
    },

    patch: {
      current: {
        pattern: "/api/sessions/current",
      },
    },
  },

  rooms: {
    post: {
      pattern: "/api/rooms",
    },

    get: {
      byRoomId: {
        pattern: "/api/rooms/:roomId",
        build: (roomId: string) => `/api/rooms/${encodeURIComponent(roomId)}`,
      },

      result: {
        byRoomId: {
          pattern: "/api/rooms/:roomId/result",
          build: (roomId: string) =>
            `/api/rooms/${encodeURIComponent(roomId)}/result`,
        },
      },
    },
  },
} as const
