import Tab from './Tab';
import type { OpenFile } from '../../hooks/useOpenFiles';

interface TabBarProps {
  openFiles: OpenFile[];
  activeFilePath: string | null;
  onTabSelect: (path: string) => void;
  onTabClose: (path: string) => void;
}

export default function TabBar({ openFiles, activeFilePath, onTabSelect, onTabClose }: TabBarProps) {
  return (
    <div className="tab-bar">
      {openFiles.map((file) => (
        <Tab
          key={file.path}
          file={file}
          isActive={file.path === activeFilePath}
          onSelect={() => onTabSelect(file.path)}
          onClose={() => onTabClose(file.path)}
        />
      ))}
    </div>
  );
}
