"use client";
import { useEffect, useRef, useState } from "react";
import { notify } from "@/lib/notify";
import { getErrorMessage } from "@/lib/format";
import * as ingestionService from "../services/ingestion-service";
import type { CsvPreview, TransactionRequest } from "../schemas/ingestion";

export function useCsvUpload() {
  const [preview, setPreview] = useState<CsvPreview>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [completed, setCompleted] = useState(false);
  const fileRef = useRef<File | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);
  async function selectFile(nextFile: File) {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    fileRef.current = null;
    setPreview(undefined);
    setError("");
    setReading(true);
    setCompleted(false);
    setProgress(0);
    try {
      const parsedPreview = await ingestionService.prepareCsvPreview(
        nextFile,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        fileRef.current = nextFile;
        setPreview(parsedPreview);
      }
    } catch (e) {
      if (!controller.signal.aborted) setError(getErrorMessage(e));
    } finally {
      if (!controller.signal.aborted) setReading(false);
    }
  }
  async function upload() {
    if (!fileRef.current || busy) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    setError("");
    try {
      const receipt = await ingestionService.uploadCsv(
        fileRef.current,
        setProgress,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        notify.success(receipt.message);
        setCompleted(true);
      }
    } catch (e) {
      if (!controller.signal.aborted) setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return {
    preview,
    error,
    busy,
    reading,
    progress,
    completed,
    selectFile,
    upload,
    cancel: () => {
      controllerRef.current?.abort();
      setBusy(false);
      setProgress(0);
    },
  };
}
export function useManualTransaction() {
  const [entries, setEntries] = useState<
    Array<{
      id: string;
      sender: string;
      receiver: string;
      amount: number;
      currency: string;
    }>
  >([]);
  const [busy, setBusy] = useState(false);
  return {
    entries,
    busy,
    submit: async (data: TransactionRequest) => {
      setBusy(true);
      try {
        const receipt = await ingestionService.submitTransaction(data);
        setEntries((current) => [
          {
            id: receipt.id,
            sender: "••••" + data.Sender_account.slice(-4),
            receiver: "••••" + data.Receiver_account.slice(-4),
            amount: data.Amount,
            currency: data.Payment_currency,
          },
          ...current,
        ]);
        notify.success(receipt.message);
        return true;
      } catch (error) {
        notify.error(getErrorMessage(error));
        return false;
      } finally {
        setBusy(false);
      }
    },
  };
}
