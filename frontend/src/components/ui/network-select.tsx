import LabelTerminal from "./label-terminal"



interface NetworkListProps {
    network: string;
    setNetwork: (value: string) => void;
    label: string;
    assetList?: string[];
}

export const NetworkList = ({ 
    network, 
    setNetwork, 
    label, 
    assetList = ["hedera", "ethereum", "polygon"] 
}: NetworkListProps) => {
    return (
        <div>
            <LabelTerminal htmlFor="network-select" className="text-sm">{label}</LabelTerminal>
            <select
                id="network-select"
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
                className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm"
            >
                {assetList.map((item) => (
                    <option key={item} value={item}>
                        {item.charAt(0).toUpperCase() + item.slice(1)}
                    </option>
                ))}
            </select>
        </div>
    )
}
