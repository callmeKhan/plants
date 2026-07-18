"use client";

import type { ReactNode } from "react";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { viVN } from "@mui/x-date-pickers/locales";
import "dayjs/locale/vi";

const datePickerTheme = createTheme({
  palette: {
    primary: {
      main: "#4f46e5",
    },
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: "var(--font-geist-sans), Arial, Helvetica, sans-serif",
  },
});

export function DatePickerProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={datePickerTheme}>
      <LocalizationProvider
        dateAdapter={AdapterDayjs}
        adapterLocale="vi"
        localeText={viVN.components.MuiLocalizationProvider.defaultProps.localeText}
      >
        {children}
      </LocalizationProvider>
    </ThemeProvider>
  );
}
