import { breakpointsTailwind, useBreakpoints } from "@vueuse/core";
import { ref } from "vue";

/** 全局移动端侧边栏抽屉开关状态 */
export const mobileSidebarOpen = ref(false);

/**
 * 响应式屏幕断点管理
 * - isMobile: < 768px (手机端，隐藏常规侧边栏，折叠紧凑播放条)
 * - isTablet: 768px ~ 1024px (平板 / PC 窗口未全屏状态)
 * - isDesktop: >= 1024px (PC 全屏 / 宽屏显示)
 * - isSmallScreen: < 1024px (非全屏桌面或移动端)
 */
export const useResponsive = () => {
  const breakpoints = useBreakpoints(breakpointsTailwind);

  const isMobile = breakpoints.smaller("md");
  const isTablet = breakpoints.between("md", "lg");
  const isDesktop = breakpoints.greaterOrEqual("lg");
  const isSmallScreen = breakpoints.smaller("lg");

  const toggleMobileSidebar = (): void => {
    mobileSidebarOpen.value = !mobileSidebarOpen.value;
  };

  const closeMobileSidebar = (): void => {
    mobileSidebarOpen.value = false;
  };

  const openMobileSidebar = (): void => {
    mobileSidebarOpen.value = true;
  };

  return {
    breakpoints,
    isMobile,
    isTablet,
    isDesktop,
    isSmallScreen,
    mobileSidebarOpen,
    toggleMobileSidebar,
    closeMobileSidebar,
    openMobileSidebar,
  };
};
