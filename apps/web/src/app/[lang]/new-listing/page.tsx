"use client";

import { useState } from "react";
import { extractPropertyFromText, ExtractedProperty } from "@kitnets/core";

export default function NewListingPage() {
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [data, setData] = useState<ExtractedProperty | null>(null);

    const handleExtract = async () => {
        setIsLoading(true);
        try {
            const result = await extractPropertyFromText(input);
            setData(result);
        } catch (error) {
            console.error("Extraction failed", error);
            alert("Failed to extract data");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto p-4">
            <h1 className="text-2xl font-bold mb-4">Create New Listing</h1>

            <div className="mb-6">
                <label className="block mb-2 font-medium">Paste Property Description</label>
                <textarea
                    className="w-full p-2 border rounded h-32 text-black"
                    placeholder="Paste WhatsApp message or text here..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                />
                <button
                    onClick={handleExtract}
                    disabled={isLoading || !input}
                    className="mt-2 bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
                >
                    {isLoading ? "Extracting..." : "Auto-Fill with AI"}
                </button>
            </div>

            {data && (
                <div className="border p-4 rounded bg-gray-50 text-black">
                    <h2 className="text-xl font-bold mb-4">Review & Confirm</h2>

                    <div className="grid gap-4">
                        <div>
                            <label className="block text-sm font-bold">Title</label>
                            <input
                                type="text"
                                className="w-full p-2 border rounded"
                                defaultValue={data.title}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold">Monthly Rent</label>
                            <input
                                type="number"
                                className="w-full p-2 border rounded"
                                defaultValue={data.monthlyRent}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold">Description</label>
                            <textarea
                                className="w-full p-2 border rounded"
                                defaultValue={data.description}
                            />
                        </div>

                        <div className="bg-green-100 p-2 rounded text-green-800 text-sm">
                            Confidence Score: {(data.confidence * 100).toFixed(0)}%
                        </div>
                    </div>

                    <div className="mt-6 flex justify-end gap-2">
                        <button className="bg-gray-300 px-4 py-2 rounded">Cancel</button>
                        <button className="bg-green-600 text-white px-4 py-2 rounded">
                            Confirm & Publish
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
