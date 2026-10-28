import { it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { act, renderHook, waitFor, render, fireEvent, screen } from "@testing-library/react";
import { useDevice } from "../../src/hooks/useDevice";
import { useWireless } from "../../src/hooks/useWireless";
import { WirelessConnect } from "../../src/components/WirelessConnect/WirelessConnect";
import { invoke, device, details } from "../fixtures/bridge";
it("F1 device selection retains explicit serial and disconnect clears connection", async () => {
    const second = { ...device, serial: "second", model: "Second" };
    let phones = [device, second];
    invoke.mockImplementation(async (name, args: any) => name === "get_connected_devices" ? phones : { ...details, serial: args.serial, name: args.serial });
    const hook = renderHook(useDevice);
    await waitFor(() => expect(hook.result.current.isConnected).toBe(true));
    act(() => hook.result.current.setActiveSerial("second"));
    await waitFor(() => expect(hook.result.current.device?.serial).toBe("second"));
    phones = [];
    await waitFor(() => expect(hook.result.current.isConnected).toBe(false), { timeout: 3000 });
    expect(hook.result.current.device).toBeNull();
});
it("F1 unauthorised phone surfaces RSA authorization instruction", async () => {
    invoke.mockResolvedValue([{ ...device, status: "unauthorized" }]);
    const hook = renderHook(useDevice);
    await waitFor(() => expect(hook.result.current.isDetecting).toBe(false));
    expect(hook.result.current.error).toContain("authorization");
    expect(hook.result.current.isConnected).toBe(false);
});
it("F1 stale details for deselected phone cannot replace active details", async () => {
    let resolveOld!: (v: any) => void;
    invoke.mockImplementation(async (name, args: any) => {
        if (name === "get_connected_devices")
            return [device, { ...device, serial: "second" }];
        if (args.serial === "FAKE-USB-1")
            return new Promise(resolve => { resolveOld = resolve; });
        return { ...details, serial: "second" };
    });
    const hook = renderHook(useDevice);
    await waitFor(() => expect(resolveOld).toBeTypeOf("function"));
    act(() => hook.result.current.setActiveSerial("second"));
    await waitFor(() => expect(hook.result.current.device?.serial).toBe("second"));
    await act(async () => { resolveOld(details); });
    expect(hook.result.current.device?.serial).toBe("second");
});
it("F11 wireless discovery polling stops with the panel and on unmount", async () => {
    vi.useFakeTimers();
    const hook = renderHook(useWireless);
    await act(async () => { hook.result.current.setWirelessPanelOpen(true); });
    expect(invoke).toHaveBeenCalledWith("discover_wireless_services");
    invoke.mockClear();
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(invoke).toHaveBeenCalledTimes(1);
    await act(async () => { hook.result.current.setWirelessPanelOpen(false); });
    invoke.mockClear();
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(invoke).not.toHaveBeenCalled();
    hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
});
it("F11 pairing failure, success, connection and disconnect state use matching commands", async () => {
    const hook = renderHook(useWireless);
    invoke.mockRejectedValueOnce(new Error("Wrong pairing code"));
    await act(async () => { await hook.result.current.pairDevice("192.0.2.1:37000", "123456"); });
    expect(hook.result.current.pairingStatus).toEqual({ failed: "Error: Wrong pairing code" });
    invoke.mockResolvedValue("paired");
    await act(async () => { await hook.result.current.pairDevice("192.0.2.1:37000", "123456"); });
    expect(hook.result.current.pairingStatus).toBe("paired");
    await act(async () => { await hook.result.current.connectDevice("192.0.2.1:5555"); await hook.result.current.disconnectDevice("192.0.2.1:5555"); });
    expect(invoke).toHaveBeenCalledWith("connect_device", { addr: "192.0.2.1:5555" });
    expect(invoke).toHaveBeenCalledWith("disconnect_device", { addr: "192.0.2.1:5555" });
});
it("F11 auto-discovery and manual IP connect choose the intended address", async () => {
    const connect = vi.fn(async () => { }), refresh = vi.fn(async () => { });
    render(<WirelessConnect nearbyServices={[{ name: "fixture", service_type: "connect", ip: "192.0.2.1", port: 5555 }]} pairingStatus={null} isDiscovering={false} error={null} onPairDevice={vi.fn(async () => { })} onConnectDevice={connect} onRefreshServices={refresh} onClearError={vi.fn()}/>);
    const user = userEvent.setup();
    await user.click(screen.getByText("Connect"));
    expect(connect).toHaveBeenCalledWith("192.0.2.1:5555");
    fireEvent.click(screen.getByText("Manual"));
    fireEvent.change(screen.getByPlaceholderText("192.168.1.5"), { target: { value: "192.0.2.2" } });
    fireEvent.change(screen.getByPlaceholderText("41234"), { target: { value: "5556" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Connect" })); });
    expect(connect).toHaveBeenCalledWith("192.0.2.2:5556");
});
it("F1 regression: late manual refresh cannot overwrite a newly selected device", async () => {
    const second = { ...device, serial: "second" };
    const base = invoke.getMockImplementation()!;
    invoke.mockImplementation(async (name, args: any) => name === "get_connected_devices" ? [device, second] : name === "get_device_details" ? { ...details, serial: args.serial } : base(name, args));
    const hook = renderHook(useDevice);
    await waitFor(() => expect(hook.result.current.device?.serial).toBe(device.serial));
    let stale!: (v: any) => void;
    invoke.mockImplementation(async (name, args: any) => name === "get_device_details" && args.serial === device.serial ? new Promise(resolve => { stale = resolve; }) : { ...details, serial: args.serial });
    act(() => hook.result.current.refreshDevice());
    act(() => hook.result.current.setActiveSerial("second"));
    await waitFor(() => expect(hook.result.current.device?.serial).toBe("second"));
    await act(async () => { stale(details); });
    expect(hook.result.current.device?.serial).toBe("second");
});

it("F1 latest refresh wins even when refreshing the same phone twice", async () => {
    const hook = renderHook(useDevice);
    await waitFor(() => expect(hook.result.current.device?.serial).toBe(device.serial));
    const resolve: Array<(value: any) => void> = [];
    invoke.mockImplementation(name => name === "get_device_details" ? new Promise(r => resolve.push(r)) : Promise.resolve([device]));
    act(() => hook.result.current.refreshDevice());
    act(() => hook.result.current.refreshDevice());
    await act(async () => { resolve[1]({ ...details, name: "Latest" }); });
    await act(async () => { resolve[0]({ ...details, name: "Old" }); });
    expect(hook.result.current.device?.name).toBe("Latest");
    expect(hook.result.current.isDetecting).toBe(false);
});
