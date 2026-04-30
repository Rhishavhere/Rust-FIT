import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { debugError } from "./debug";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary that catches unhandled JS exceptions inside the
 * component tree and renders a useful debug screen instead of the generic
 * Expo Go "Something went wrong" crash page.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("ErrorBoundary caught:", error, info.componentStack);
    debugError("ErrorBoundary", "componentDidCatch", {
      name: error.name,
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <View style={styles.root}>
          <Text style={styles.title}>FIT — Crash Report</Text>
          <Text style={styles.subtitle}>
            An unhandled error occurred. Details below:
          </Text>
          <ScrollView style={styles.scroll}>
            <Text style={styles.errorName}>{this.state.error?.name}</Text>
            <Text style={styles.errorMsg}>{this.state.error?.message}</Text>
            <Text style={styles.stack}>{this.state.error?.stack}</Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0b1220",
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  title: {
    color: "#ef4444",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  subtitle: {
    color: "#93acc7",
    fontSize: 14,
    marginBottom: 16,
  },
  scroll: {
    flex: 1,
    backgroundColor: "#101b2c",
    borderRadius: 10,
    padding: 12,
    borderColor: "#1d2b41",
    borderWidth: 1,
  },
  errorName: {
    color: "#fbbf24",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  errorMsg: {
    color: "#f87171",
    fontSize: 14,
    marginBottom: 12,
  },
  stack: {
    color: "#7c8da0",
    fontFamily: "monospace",
    fontSize: 11,
  },
});
