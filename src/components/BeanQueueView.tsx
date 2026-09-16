import React, { useState } from 'react';
import {
  Coffee,
  Flame,
  Calendar,
  Tag,
  CheckCircle2,
  Edit3,
  Save,
  X,
  Plus,
  Trash2,
  Search,
  Filter,
} from 'lucide-react';
import { BeanCode, BeanItem } from '../types';
import { BEAN_LEGENDS } from '../data/initialData';

interface BeanQueueViewProps {
  beans: BeanItem[];
  onUpdateBean: (updatedBean: BeanItem) => void;
  onAddBean: (newBean: BeanItem) => void;
  onDeleteBean: (code: BeanCode) => void;
}

export const BeanQueueView: React.FC<BeanQueueViewProps> = ({
  beans,
  onUpdateBean,
  onAddBean,
  onDeleteBean,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoastFilter, setSelectedRoastFilter] = useState<string>('all');
  const [editingCode, setEditingCode] = useState<BeanCode | null>(null);
  const [editFormData, setEditFormData] = useState<BeanItem | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newBeanData, setNewBeanData] = useState<BeanItem>({
    code: 'CHAMP',
    name: '',
    roastProfile: 'シティロースト (中煎り)',
    roastDate: new Date().toISOString().split('T')[0],
    flavorNotes: '',
    origin: '',
    stockGrams: 1000,
  });

  const roastOptions = ['all', '浅煎り', '中煎り', '中深煎り', '深煎り', '極深煎り'];

  const filteredBeans = beans.filter((b) => {
    const matchesSearch =
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.flavorNotes.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.origin.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRoast =
      selectedRoastFilter === 'all' || b.roastProfile.includes(selectedRoastFilter);

    return matchesSearch && matchesRoast;
  });

  const startEdit = (bean: BeanItem) => {
    setEditingCode(bean.code);
    setEditFormData({ ...bean });
  };

  const cancelEdit = () => {
    setEditingCode(null);
    setEditFormData(null);
  };

  const saveEdit = () => {
    if (editFormData) {
      onUpdateBean(editFormData);
      setEditingCode(null);
      setEditFormData(null);
    }
  };

  const handleAddNewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBeanData.name.trim()) return;
    onAddBean(newBeanData);
    setIsAddingNew(false);
    setNewBeanData({
      code: 'SP',
      name: '',
      roastProfile: 'シティロースト (中煎り)',
      roastDate: new Date().toISOString().split('T')[0],
      flavorNotes: '',
      origin: '',
      stockGrams: 1000,
    });
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 overflow-y-auto max-w-7xl mx-auto touch-manipulation">
      {/* Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Coffee className="w-6 h-6 text-[#006c4a]" />
            <span>豆キュー＆ロースタリー管理メニュー</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            豆銘柄・焙煎プロファイル・在庫量（g）・フレーバーノートを直接編集できます（iPadタッチ対応）
          </p>
        </div>

        <button
          id="btn-add-new-bean"
          onClick={() => setIsAddingNew(true)}
          className="min-h-[44px] px-4 py-2 bg-[#006c4a] hover:bg-[#005137] text-white rounded-lg font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-all active:scale-95 cursor-pointer select-none shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>新規コーヒー豆追加</span>
        </button>
      </div>

      {/* Filter / Search Bar for iPad Quick Interaction */}
      <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="銘柄名、産地、フレーバーノートで検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden sm:inline" />
          {roastOptions.map((opt) => (
            <button
              key={opt}
              onClick={() => setSelectedRoastFilter(opt)}
              className={`min-h-[36px] px-3 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                selectedRoastFilter === opt
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {opt === 'all' ? '全ロースト' : opt}
            </button>
          ))}
        </div>
      </div>

      {/* Add New Bean Form Modal */}
      {isAddingNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 select-none">
          <div className="bg-white w-full max-w-lg rounded-xl border border-slate-300 shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-600" />
                <span>新規コーヒー銘柄の登録</span>
              </h3>
              <button
                onClick={() => setIsAddingNew(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddNewSubmit} className="p-5 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">豆コード</label>
                  <select
                    value={newBeanData.code}
                    onChange={(e) =>
                      setNewBeanData({ ...newBeanData, code: e.target.value as BeanCode })
                    }
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-mono font-bold"
                  >
                    {BEAN_LEGENDS.map((leg) => (
                      <option key={leg.code} value={leg.code}>
                        {leg.code} ({leg.subLabel})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">在庫量 (g)</label>
                  <input
                    type="number"
                    value={newBeanData.stockGrams}
                    onChange={(e) =>
                      setNewBeanData({ ...newBeanData, stockGrams: Number(e.target.value) })
                    }
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">銘柄名</label>
                <input
                  type="text"
                  placeholder="例: エチオピア イルガチェフェ G1"
                  value={newBeanData.name}
                  onChange={(e) => setNewBeanData({ ...newBeanData, name: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-bold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">焙煎度</label>
                  <input
                    type="text"
                    value={newBeanData.roastProfile}
                    onChange={(e) =>
                      setNewBeanData({ ...newBeanData, roastProfile: e.target.value })
                    }
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">焙煎日・エイジング</label>
                  <input
                    type="text"
                    value={newBeanData.roastDate}
                    onChange={(e) =>
                      setNewBeanData({ ...newBeanData, roastDate: e.target.value })
                    }
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">産地・精製方法</label>
                <input
                  type="text"
                  placeholder="例: エチオピア・イルガチェフェ地区 / 水洗式"
                  value={newBeanData.origin}
                  onChange={(e) => setNewBeanData({ ...newBeanData, origin: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">フレーバーノート</label>
                <textarea
                  rows={2}
                  placeholder="例: ジャスミン, アールグレイ, ピーチ, シトラス"
                  value={newBeanData.flavorNotes}
                  onChange={(e) =>
                    setNewBeanData({ ...newBeanData, flavorNotes: e.target.value })
                  }
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800"
                  required
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddingNew(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#006c4a] hover:bg-[#005137] text-white font-bold"
                >
                  豆キューに登録
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bean Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {filteredBeans.map((bean) => {
          const legend = BEAN_LEGENDS.find((l) => l.code === bean.code);
          const isEditing = editingCode === bean.code;

          return (
            <div
              key={bean.code}
              id={`bean-card-${bean.code.toLowerCase()}`}
              className={`bg-white rounded-xl border p-4 shadow-xs flex flex-col justify-between transition-all select-none ${
                isEditing
                  ? 'ring-2 ring-blue-500 border-blue-500 shadow-md bg-blue-50/20'
                  : 'border-slate-300 hover:border-slate-400 hover:shadow-sm'
              }`}
            >
              {isEditing && editFormData ? (
                /* Edit Mode */
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="font-mono font-bold text-xs text-blue-700">編集モード</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={cancelEdit}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded"
                        title="キャンセル"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                      銘柄名
                    </label>
                    <input
                      type="text"
                      value={editFormData.name}
                      onChange={(e) =>
                        setEditFormData({ ...editFormData, name: e.target.value })
                      }
                      className="w-full p-1.5 border border-slate-300 rounded text-xs font-bold text-slate-900 bg-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                        在庫 (g)
                      </label>
                      <input
                        type="number"
                        value={editFormData.stockGrams}
                        onChange={(e) =>
                          setEditFormData({
                            ...editFormData,
                            stockGrams: Number(e.target.value),
                          })
                        }
                        className="w-full p-1.5 border border-slate-300 rounded text-xs font-mono font-bold bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                        焙煎度
                      </label>
                      <input
                        type="text"
                        value={editFormData.roastProfile}
                        onChange={(e) =>
                          setEditFormData({
                            ...editFormData,
                            roastProfile: e.target.value,
                          })
                        }
                        className="w-full p-1.5 border border-slate-300 rounded text-xs bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                      焙煎日・エイジング
                    </label>
                    <input
                      type="text"
                      value={editFormData.roastDate}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          roastDate: e.target.value,
                        })
                      }
                      className="w-full p-1.5 border border-slate-300 rounded text-xs bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                      産地・規格
                    </label>
                    <input
                      type="text"
                      value={editFormData.origin}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          origin: e.target.value,
                        })
                      }
                      className="w-full p-1.5 border border-slate-300 rounded text-xs bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                      フレーバーノート
                    </label>
                    <textarea
                      rows={2}
                      value={editFormData.flavorNotes}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          flavorNotes: e.target.value,
                        })
                      }
                      className="w-full p-1.5 border border-slate-300 rounded text-xs text-slate-800 bg-white"
                    />
                  </div>

                  <div className="pt-2 flex items-center gap-2">
                    <button
                      onClick={saveEdit}
                      className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs touch-manipulation cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>保存</span>
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold touch-manipulation"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                /* Normal Display Mode */
                <div className="flex flex-col h-full justify-between">
                  <div>
                    {/* Top Row: Code Badge & Stock & Edit Button */}
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${legend?.badgeBg} ${legend?.badgeText} ${legend?.borderColor}`}
                      >
                        {bean.code}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                          {bean.stockGrams}g
                        </span>
                        <button
                          onClick={() => startEdit(bean)}
                          className="min-w-[32px] min-h-[32px] rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-blue-600 touch-manipulation cursor-pointer transition-colors"
                          title="豆情報を編集"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Bean Name */}
                    <h3 className="font-bold text-[14px] text-slate-900 leading-tight mb-2">
                      {bean.name}
                    </h3>

                    {/* Metadata list */}
                    <div className="space-y-1.5 text-xs text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <Flame className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span className="font-medium text-slate-800">{bean.roastProfile}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span className="text-[11px] text-slate-600">{bean.roastDate}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span className="text-[11px] truncate text-slate-600" title={bean.origin}>
                          {bean.origin}
                        </span>
                      </div>
                    </div>

                    {/* Flavor Notes Box */}
                    <div className="mt-3 p-2 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-700">
                      <span className="font-bold text-slate-500 block mb-0.5">
                        フレーバーノート:
                      </span>
                      <span className="leading-snug">{bean.flavorNotes}</span>
                    </div>
                  </div>

                  {/* Footer status & quick action */}
                  <div className="mt-4 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1 font-semibold text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      ディスパッチ連動
                    </span>

                    <button
                      onClick={() => startEdit(bean)}
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline touch-manipulation"
                    >
                      内容を編集
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filteredBeans.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-400 text-xs border border-dashed rounded-xl bg-slate-50">
            該当するコーヒー豆が見つかりませんでした。
          </div>
        )}
      </div>
    </div>
  );
};
