import {
  ArrowDown, ArrowLeft, ArrowRight, Box, Calendar, Check, CircleCheck, CircleClose,
  Clock, Coin, Collection, Connection, CopyDocument, CreditCard, Delete, Document,
  Download, Edit, EditPen, Expand, FirstAidKit, Fold, Folder, FolderOpened, Loading,
  Lock, MagicStick, Memo, Message, Microphone, Money, Odometer, OfficeBuilding,
  Picture, Plus, Printer, Refresh, Search, Select, Setting, Switch, SwitchButton,
  TrendCharts, Upload, User, VideoPause, Wallet, Warning,
} from '@element-plus/icons-vue'

// Keep template names and dynamic icon strings available without importing the full library.
// Element Plus imports the icons used inside its own controls independently.
export const appIcons = {
  ArrowDown, ArrowLeft, ArrowRight, Box, Calendar, Check, CircleCheck, CircleClose,
  Clock, Coin, Collection, CopyDocument, CreditCard, Delete, Document, Download,
  Edit, EditPen, Expand, FirstAidKit, Fold, Folder, FolderOpened, Loading, Lock,
  MagicStick, Memo, Message, Microphone, Money, Odometer, OfficeBuilding, Picture,
  Plus, Printer, Refresh, Search, Select, Setting, Switch, SwitchButton, TrendCharts,
  Upload, User, VideoPause, Wallet, Warning,
  // The patient merge action predates this registry; the icon package has no Merge export.
  Merge: Connection,
}

export function registerAppIcons(app) {
  for (const [name, component] of Object.entries(appIcons)) {
    app.component(name, component)
  }
}
